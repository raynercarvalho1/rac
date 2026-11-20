-- status: pendente
-- RAC Inbox · conexão OAuth 2.0 do Gmail e do Outlook (docs/inbox.md, "Gmail e Outlook"). PREPARADA, NÃO APLICADA em produção (o dono roda, com autorização própria).
-- Pode rodar de novo sem estragar nada. Ordem: 051 → 052 → este arquivo.
--
-- O QUE FAZ
--   1) inbox_cofre.oauth_estados (schema PRIVADO): o "state" de cada conexão em andamento (guardado só como hash SHA-256) e o verificador PKCE. Dura 10 minutos e é de USO ÚNICO.
--      O site nunca lê nem escreve aqui: só a Edge Function, por conexão direta (como o cofre).
--   2) inbox_cofre.oauth_abrir / oauth_consumir: abrir uma conexão (a conta é do dono e é Gmail ou Outlook) e consumir o state (apaga ao ler; expirado = não existe).
--   3) inbox_cofre.guardar passa a aceitar até 6000 caracteres: o refresh token da Microsoft passa de 600 caracteres. O refresh token continua no Vault, como a senha de app.
-- Tokens de acesso NUNCA são guardados (nem aqui, nem no Vault, nem no navegador): vivem só na memória de uma chamada da função.

begin;

create table if not exists inbox_cofre.oauth_estados (
  estado_hash text primary key check (estado_hash ~ '^[0-9a-f]{64}$'),
  dono        uuid not null,
  conta_id    uuid not null,
  provedor    text not null check (provedor in ('gmail', 'outlook')),
  verificador text not null check (length(verificador) between 43 and 128),
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  foreign key (conta_id, dono) references public.inbox_contas (id, dono) on delete cascade
);
revoke all on inbox_cofre.oauth_estados from public, anon, authenticated, service_role;

create or replace function inbox_cofre.oauth_abrir(p_dono uuid, p_conta uuid, p_estado_hash text, p_verificador text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_prov text;
begin
  if p_dono is null or p_conta is null or p_estado_hash is null or p_verificador is null then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select c.provedor into v_prov from public.inbox_contas c where c.id = p_conta and c.dono = p_dono;
  if v_prov is null then raise exception 'conta_inexistente' using errcode = 'P0002'; end if;
  if v_prov not in ('gmail', 'outlook') then raise exception 'provedor_invalido' using errcode = '22023'; end if;
  delete from inbox_cofre.oauth_estados where expira_em < now();                                  -- limpeza do que expirou
  delete from inbox_cofre.oauth_estados where dono = p_dono and conta_id = p_conta;                -- uma conexão por conta de cada vez
  if (select count(*) from inbox_cofre.oauth_estados where dono = p_dono) >= 10 then raise exception 'limite' using errcode = '54000'; end if;
  insert into inbox_cofre.oauth_estados (estado_hash, dono, conta_id, provedor, verificador, expira_em)
    values (p_estado_hash, p_dono, p_conta, v_prov, p_verificador, now() + interval '10 minutes');
  return v_prov;
end $$;

create or replace function inbox_cofre.oauth_consumir(p_dono uuid, p_estado_hash text) returns table (conta_id uuid, provedor text, verificador text)
  language plpgsql security definer set search_path = '' as $$
begin
  if p_dono is null or p_estado_hash is null then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return query
    delete from inbox_cofre.oauth_estados e where e.estado_hash = p_estado_hash and e.dono = p_dono and e.expira_em >= now()
    returning e.conta_id, e.provedor, e.verificador;                                               -- uso único: ao ler, apaga
  if not found then raise exception 'estado_invalido' using errcode = 'P0002'; end if;
end $$;

-- guardar: o mesmo corpo da 052, com o limite maior (refresh token da Microsoft)
create or replace function inbox_cofre.guardar(p_dono uuid, p_conta uuid, p_segredo text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_sid uuid; v_nome text := 'inbox_conta_' || p_conta::text;
begin
  if p_dono is null or p_conta is null or p_segredo is null or length(p_segredo) not between 1 and 6000 then
    raise exception 'entrada_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform 1 from public.inbox_contas c where c.id = p_conta and c.dono = p_dono for update;
  if not found then raise exception 'conta_inexistente' using errcode = 'P0002'; end if;
  select k.segredo_id into v_sid from public.inbox_credenciais k where k.conta_id = p_conta and k.dono = p_dono for update;
  if v_sid is null then
    v_sid := vault.create_secret(p_segredo, v_nome, 'RAC Inbox: credencial de conta de e-mail');
    insert into public.inbox_credenciais (dono, conta_id, segredo_id) values (p_dono, p_conta, v_sid);
  else
    perform vault.update_secret(v_sid, p_segredo, v_nome, 'RAC Inbox: credencial de conta de e-mail');
    update public.inbox_credenciais set estado = 'ativa', atualizado_em = now(), ultima_validacao_em = null where conta_id = p_conta and dono = p_dono;
  end if;
  update public.inbox_contas set estado = 'nova', ultimo_erro = null where id = p_conta and dono = p_dono and estado in ('erro_autenticacao', 'desconectada');
end $$;

revoke all on function inbox_cofre.oauth_abrir(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.oauth_consumir(uuid, text) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.guardar(uuid, uuid, text) from public, anon, authenticated, service_role;

commit;

-- conferir depois (só leitura):
--   select has_function_privilege('authenticated', 'inbox_cofre.oauth_consumir(uuid, text)', 'execute');   -- false
--   select has_table_privilege('authenticated', 'inbox_cofre.oauth_estados', 'select');                    -- false
--   select inbox_cofre.conferir();                                                                          -- zeros
