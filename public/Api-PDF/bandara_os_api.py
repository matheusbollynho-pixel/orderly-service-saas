# -*- coding: utf-8 -*-
"""
BANDARA MOTOS — Gerador de Ordem de Serviço em PDF
====================================================
Dependências:
    pip install reportlab flask

Uso como API Flask:
    python bandara_os_api.py
    POST /gerar-os  com JSON da O.S -> retorna PDF para download

Uso direto em Python:
    from bandara_os_api import create_os_pdf
    create_os_pdf("saida.pdf", dados)
"""

import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

# ---------------------------------------------------------------------------
# GERADOR DE PDF
# ---------------------------------------------------------------------------

def create_os_pdf(output_path: str, dados: dict) -> None:
    """
    Gera o PDF da Ordem de Serviço com os dados fornecidos.

    Estrutura esperada de `dados`:
    {
        "os": {
            "numero":       "dd1d486b-...",
            "status":       "Concluida e Entregue",
            "mecanico":     "Matheus",
            "criador":      "Matheus",
            "data_entrada": "09/03/2026",
            "data_conclusao":"09/03/2026",
            "data_entrega": "09/03/2026"
        },
        "cliente": {
            "nome":                   "Matheus",
            "apelido":                "bollynho",
            "telefone":               "(75) 98898-8629",
            "autoriza_instagram":     "Sim",
            "autoriza_lembretes":     "Sim"
        },
        "terceiro": {
            "nome":     "",
            "telefone": "",
            "cpf":      ""
        },
        "veiculo": {
            "tipo":        "MOTO",
            "modelo":      "HONDA CG 125 1981 - VERMELHA",
            "identificacao":"DSA DSA 2022 (TD5A)",
            "servico":     "Troca de óleo"
        },
        "checklist": {
            "chave":    "Sim",
            "motor":    "Nao",
            "eletrica": "Nao",
            "gasolina": 2        # número de estrelas preenchidas (0-5)
        },
        "observacoes": "",
        "pecas": [
            {"descricao": "Óleo",         "qtd": "01", "valor_unit": "R$ 30,00", "total": "R$ 30,00"},
            {"descricao": "Disco freio",   "qtd": "01", "valor_unit": "R$ 80,00", "total": "R$ 80,00"}
        ],
        "financeiro": {
            "total":     "R$ 110,00",
            "recebido":  "R$ 110,00",
            "desconto":  "R$ 0,00"
        },
        "logo_path": "bandara_logo_transparent.png"   # caminho para a logo (PNG transparente)
    }
    """

    # Atalhos — aceita tanto o formato do banco direto quanto o formato estruturado
    def sv(val):
        """Converte None para string vazia e faz strip."""
        return str(val).strip() if val is not None else ''

    def fmt_sim_nao_val(val):
        v = str(val).strip().lower()
        return 'Sim' if v in ('sim','yes','true','1','s') else 'Nao'

    def fmt_data(val):
        """Formata datas ISO para dd/mm/aaaa."""
        if not val:
            return ''
        try:
            from datetime import datetime
            dt = str(val)[:10]  # pega só YYYY-MM-DD
            return datetime.strptime(dt, '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            return str(val)[:10]

    def fmt_status(val):
        """Converte status do banco para label legível."""
        mapa = {
            'concluida_entregue': 'Concluida e Entregue',
            'concluida':          'Concluida',
            'em_andamento':       'Em Andamento',
            'aguardando':         'Aguardando',
            'orcamento':          'Orcamento',
        }
        return mapa.get(str(val).lower(), sv(val))

    # Suporte ao formato do banco (campos planos) OU formato estruturado
    is_flat = 'client_name' in dados or 'equipment' in dados

    if is_flat:
        # ── Formato direto do banco ──────────────────────────────────────
        # checklist_items: [{name:'Chave da MOTO', status:'sim'}, ...]
        chk_items = {}
        obs_checklist = ''
        for item in dados.get('checklist_items', []):
            key   = sv(item.get('label') or item.get('name') or '').lower()
            itype = sv(item.get('item_type') or '').lower()
            # textarea = campo de observações
            if itype == 'textarea' or 'observa' in key:
                obs_checklist = sv(item.get('observations') or item.get('value') or item.get('text') or '')
                continue
            # rating = gasolina/estrelas
            if itype == 'rating':
                r = item.get('rating') or item.get('completed')
                chk_items[key] = {'rating': r, 'status': None}
                continue
            # yesno = sim/nao baseado em completed (bool)
            completed = item.get('completed')
            status_val = item.get('status') or item.get('value')
            # Suporte a bool True/False vindo do banco
            if isinstance(completed, bool):
                resolved_status = completed
            elif isinstance(completed, str):
                resolved_status = completed.lower() in ('true', 'sim', '1', 'yes')
            else:
                resolved_status = False
            chk_items[key] = {
                'rating':     item.get('rating'),
                'status':     resolved_status,
                'status_raw': status_val,
            }

        import unicodedata as _ud
        def _norm(s):
            return _ud.normalize('NFD', str(s)).encode('ascii','ignore').decode('ascii').lower()

        def chk_get(keywords):
            for k, v in chk_items.items():
                kn = _norm(k)
                if any(kw in kn for kw in keywords):
                    s = v.get('status')
                    if isinstance(s, bool):
                        return 'Sim' if s else 'Nao'
                    raw = v.get('status_raw')
                    return fmt_sim_nao_val(raw) if raw is not None else 'Nao'
            return 'Nao'

        gasolina_val = 0
        for k, v in chk_items.items():
            if any(kw in _norm(k) for kw in ['gasolin', 'nivel', 'gasolina', 'combustiv']):
                r = v.get('rating')
                if r is not None:
                    try: gasolina_val = int(float(r)); break
                    except: pass

        # materials: suporta descricao/name/description e quantidade/quantity/qtd
        pecas = []
        for m in dados.get('materials', []):
            qtd   = m.get('quantidade') or m.get('quantity') or m.get('qtd') or 1
            try:    qtd_s = str(int(str(qtd).strip())).zfill(2)
            except: qtd_s = '01'
            preco = m.get('valor') or m.get('price') or m.get('value') or 0
            nome  = sv(m.get('descricao') or m.get('name') or m.get('description') or '')
            try:
                preco_f   = float(preco)
                qtd_f     = float(str(qtd).strip())
                preco_fmt = f"R$ {preco_f:,.2f}".replace(',','X').replace('.',',').replace('X','.')
                total_fmt = f"R$ {preco_f * qtd_f:,.2f}".replace(',','X').replace('.',',').replace('X','.')
            except:
                preco_fmt = 'R$ 0,00'
                total_fmt = 'R$ 0,00'
            pecas.append({
                'descricao':  nome,
                'qtd':        qtd_s,
                'valor_unit': preco_fmt,
                'total':      total_fmt,
            })

        # payments — resolve finalized_by nome via staff_members_map se disponivel
        _staff_map = {m.get('id',''):m.get('name', m.get('nome','')) for m in dados.get('staff_members', dados.get('teamMembers', []))}
        payments_detail = []
        for p in dados.get('payments', []):
            amt  = float(p.get('amount') or p.get('valor') or 0)
            met  = (p.get('method') or p.get('forma') or '').capitalize()
            fid  = p.get('finalized_by_staff_id') or p.get('finalized_by') or ''
            fnome = _staff_map.get(fid, p.get('finalized_by_name','') or '')
            payments_detail.append({'amount': amt, 'method': met, 'name': fnome})
        total_pago = sum(p['amount'] for p in payments_detail)
        total_os   = sum(
            float(m.get('valor') or m.get('price') or m.get('value') or 0) *
            float(str(m.get('quantidade') or m.get('quantity') or m.get('qtd') or 1).strip())
            for m in dados.get('materials', [])
        )
        def fmt_brl(v):
            try:
                return f"R$ {float(v):,.2f}".replace(',','X').replace('.',',').replace('X','.')
            except:
                return 'R$ 0,00'

        os_data = {
            'numero':        sv(dados.get('id')),
            'status':        fmt_status(dados.get('status', '')),
            'mecanico':      sv(dados.get('mechanic_name') or dados.get('mechanic_username') or dados.get('mechanic') or dados.get('mechanic_email') or ''),
            'criador':       sv(dados.get('created_by_name') or dados.get('creator_name') or dados.get('criador') or '') or sv(dados.get('created_by') or ''),

            'data_entrada':  fmt_data(dados.get('entry_date') or dados.get('created_at')),
            'data_conclusao':fmt_data(dados.get('conclusion_date') or dados.get('concluded_at')),
            'data_entrega':  fmt_data(dados.get('exit_date') or dados.get('conclusion_date') or dados.get('delivery_date') or dados.get('delivered_at')),
        }
        def fmt_nasc(val):
            if not val: return ''
            try:
                from datetime import datetime
                return datetime.strptime(str(val)[:10], '%Y-%m-%d').strftime('%d/%m/%Y')
            except:
                return sv(val)
        def fmt_cpf(val):
            v = sv(val).replace('.','').replace('-','').replace(' ','')
            if len(v) == 11:
                return f"{v[:3]}.{v[3:6]}.{v[6:9]}-{v[9:]}"
            return v
        def fmt_phone(val):
            v = sv(val).replace('(','').replace(')','').replace(' ','').replace('-','')
            if len(v) == 11:
                return f"({v[:2]}) {v[2:7]}-{v[7:]}"
            if len(v) == 10:
                return f"({v[:2]}) {v[2:6]}-{v[6:]}"
            return v
        # Extrai terceiro autorizado do problem_description
        import re
        prob_raw = sv(dados.get('problem_description') or '')
        terceiro_nome = ''
        terceiro_tel = ''
        terceiro_cpf = ''
        match_terceiro = re.search(
            r'Retirada: Outra pessoa - Nome: (.+?) \| Tel: (.+?) \| CPF: (.+?)(?:\n|$)',
            prob_raw
        )
        if match_terceiro:
            terceiro_nome = match_terceiro.group(1).strip()
            terceiro_tel  = match_terceiro.group(2).strip()
            terceiro_cpf  = match_terceiro.group(3).strip()
        prob = re.sub(r'\s*\(cadastro express\)', '', prob_raw, flags=re.IGNORECASE)
        prob = re.split(r'\n\nRetirada:', prob)[0].strip()
        prob = re.sub(r'\s*\(\s*\)', '', prob).strip()
        _problem = prob
        _ter_nome = terceiro_nome
        _ter_tel = terceiro_tel
        _ter_cpf = terceiro_cpf
        _servico  = _problem

        cli = {
            'nome':               sv(dados.get('client_name')),
            'apelido':            sv(dados.get('client_apelido')),
            'telefone':           fmt_phone(dados.get('client_phone', '')),
            'cpf':                fmt_cpf(dados.get('client_cpf', '')),
            'nascimento':         fmt_nasc(dados.get('client_birth_date', '')),
            'endereco':           sv(dados.get('client_address', '')),
            'instagram':          sv(dados.get('client_instagram', '')),
            'autoriza_instagram': fmt_sim_nao_val(dados.get('autoriza_instagram', False)),
            'autoriza_lembretes': fmt_sim_nao_val(dados.get('autoriza_lembretes', False)),
        }
        _equip = sv(dados.get('equipment') or '')
        ter = {
            'nome':     sv(dados.get('terceiro_nome') or dados.get('authorized_name') or _ter_nome or ''),
            'telefone': sv(dados.get('terceiro_telefone') or dados.get('authorized_phone') or _ter_tel or ''),
            'cpf':      sv(dados.get('terceiro_cpf') or dados.get('authorized_cpf') or _ter_cpf or ''),
        }
        vei = {
            'tipo':          sv(dados.get('vehicle_type') or 'MOTO'),
            'modelo':        sv(dados.get('motorcycle_model') or _equip),
            'identificacao': sv(dados.get('motorcycle_plate') or dados.get('motorcycle_chassis') or ''),
            'servico':       _servico.replace('\n', ' ').strip(),
        }
        chk = {
            'chave':    chk_get(['chave', 'key']),
            'motor':    chk_get(['motor', 'engine', 'funcionamento']),
            'eletrica': chk_get(['eletric', 'electr']),
            'gasolina': gasolina_val,
        }
        obs          = sv(dados.get('observacoes') or dados.get('observations') or obs_checklist or '')
        sig_inspecao  = dados.get('signature_data', '')         or ''
        sig_entrega   = dados.get('delivery_signature_data', '') or ''
        fin      = {
            'total':           fmt_brl(total_os),
            'recebido':        fmt_brl(total_pago),
            'desconto':        fmt_brl(dados.get('discount', 0)),
            'payments_detail': payments_detail,
        }
    else:
        # ── Formato estruturado (legado) ─────────────────────────────────
        os_data   = dados.get("os", {})
        cli       = dados.get("cliente", {})
        ter       = dados.get("terceiro", {})
        vei       = dados.get("veiculo", {})
        chk       = dados.get("checklist", {})
        obs       = dados.get("observacoes", "")
        pecas        = dados.get("pecas", [])
        fin          = dados.get("financeiro", {})
        sig_inspecao = dados.get('signature_data', '')          or ''
        sig_entrega  = dados.get('delivery_signature_data', '') or ''

    logo_path = dados.get("logo_path", "bandara_logo_transparent.png")
    if not os.path.isabs(logo_path):
        logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), logo_path)

    c = canvas.Canvas(output_path, pagesize=A4)
    w, h = A4

    # ── Tokens de cor ──────────────────────────────────────────────────────
    BLACK       = colors.HexColor('#0D0D0D')
    DARK        = colors.HexColor('#1C1C1E')
    CHARCOAL    = colors.HexColor('#2C2C2E')
    STEEL       = colors.HexColor('#48484A')
    MUTED       = colors.HexColor('#8E8E93')
    SILVER      = colors.HexColor('#C7C7CC')
    CLOUD       = colors.HexColor('#F2F2F7')
    WHITE       = colors.white
    ACCENT      = colors.HexColor('#CC0000')
    ACCENT_DARK = colors.HexColor('#990000')
    GREEN       = colors.HexColor('#34C759')
    AMBER       = colors.HexColor('#FFD60A')
    ROW_ALT     = colors.HexColor('#F8F8FA')

    M  = 13*mm
    CW = w - 2*M
    RH = 6.2*mm
    SH = 5.5*mm

    y = h

    # ── CABEÇALHO ──────────────────────────────────────────────────────────
    c.setFillColor(DARK)
    c.rect(0, h - 22*mm, w, 22*mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, h - 22*mm, 2.5*mm, 22*mm, fill=1, stroke=0)

    if os.path.exists(logo_path):
        c.drawImage(logo_path, M, h - 21*mm, width=21*mm, height=21*mm, mask='auto')

    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 15)
    c.drawCentredString(w/2, h - 10*mm, 'ORDEM DE SERVICO')
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.2)
    c.line(w/2 - 26*mm, h - 12.5*mm, w/2 + 26*mm, h - 12.5*mm)

    # Badge de status
    status_label = os_data.get("status", "").upper()
    badge_w = 30*mm
    badge_h = 6*mm
    bx = w - M - badge_w
    by = h - 18*mm
    badge_color = GREEN if "CONCLU" in status_label else colors.HexColor('#FF9F0A')
    c.setFillColor(badge_color)
    c.roundRect(bx, by, badge_w, badge_h, 3*mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 6)
    c.drawCentredString(bx + badge_w/2, by + 2.1*mm, status_label or 'EM ANDAMENTO')

    y = h - 25*mm

    # ── Funções de layout ──────────────────────────────────────────────────
    def section_header(label, ypos):
        c.setFillColor(CHARCOAL)
        c.rect(M, ypos - SH, CW, SH, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.rect(M, ypos - SH, 2.5*mm, SH, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 7)
        c.drawString(M + 5*mm, ypos - SH + 1.7*mm, label.upper())
        return ypos - SH

    def field_row(label, value, ypos, lw=42*mm, alt=False):
        bg = ROW_ALT if alt else WHITE
        c.setFillColor(bg)
        c.rect(M, ypos - RH, CW, RH, fill=1, stroke=0)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.3)
        c.line(M, ypos - RH, M + CW, ypos - RH)
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Bold', 6.8)
        c.drawString(M + 3*mm, ypos - RH + 2*mm, label)
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(M + lw, ypos - RH + 2*mm, str(value) if value is not None else '')
        return ypos - RH

    def two_fields(l1, v1, l2, v2, ypos, lw1=28*mm, lw2=28*mm, alt=False):
        half = CW / 2
        bg = ROW_ALT if alt else WHITE
        c.setFillColor(bg)
        c.rect(M, ypos - RH, CW, RH, fill=1, stroke=0)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.3)
        c.line(M, ypos - RH, M + CW, ypos - RH)
        c.line(M + half, ypos - RH + 1*mm, M + half, ypos - 1*mm)
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Bold', 6.8)
        c.drawString(M + 3*mm, ypos - RH + 2*mm, l1)
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(M + lw1, ypos - RH + 2*mm, str(v1))
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Bold', 6.8)
        c.drawString(M + half + 3*mm, ypos - RH + 2*mm, l2)
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(M + half + lw2, ypos - RH + 2*mm, str(v2))
        return ypos - RH

    def checklist_item(cx, cy, label, status, iw, alt=False):
        bg = ROW_ALT if alt else WHITE
        c.setFillColor(bg)
        c.rect(cx, cy - RH, iw, RH, fill=1, stroke=0)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.3)
        c.line(cx, cy - RH, cx + iw, cy - RH)
        pill_w = 9*mm
        pill_h = 3.8*mm
        pill_y = cy - RH + (RH - pill_h) / 2
        # Aceita: 'Sim','sim','SIM','true','True','1',True,1
        status_norm = str(status).strip().lower()
        is_sim = status_norm in ('sim', 'yes', 'true', '1', 's')
        sim_bg = GREEN  if is_sim else SILVER
        nao_bg = ACCENT if not is_sim else SILVER
        c.setFillColor(sim_bg)
        c.roundRect(cx + 2.5*mm, pill_y, pill_w, pill_h, 1.8*mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 5.5)
        c.drawCentredString(cx + 2.5*mm + pill_w/2, pill_y + 1.2*mm, 'SIM')
        c.setFillColor(nao_bg)
        c.roundRect(cx + 12.5*mm, pill_y, pill_w, pill_h, 1.8*mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.drawCentredString(cx + 12.5*mm + pill_w/2, pill_y + 1.2*mm, 'NAO')
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(cx + 23*mm, cy - RH + 2*mm, label)

    # ── IDENTIFICAÇÃO DA O.S ───────────────────────────────────────────────
    y = section_header('Identificacao da Ordem de Servico', y)
    y = two_fields('N da O.S', str(os_data.get('numero') or '').strip(), 'Status', str(os_data.get('status') or '').strip(), y, lw1=18*mm, lw2=18*mm)
    y = two_fields('Mecanico', str(os_data.get('mecanico') or '').strip(), 'Criador O.S', str(os_data.get('criador') or '').strip(), y, alt=True)

    third = CW / 3
    c.setFillColor(WHITE)
    c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
    c.setStrokeColor(SILVER)
    c.setLineWidth(0.3)
    c.line(M, y - RH, M + CW, y - RH)
    datas = [
        ('Data de Entrada',   os_data.get('data_entrada',   '')),
        ('Data de Conclusao', os_data.get('data_conclusao', '')),
        ('Data de Entrega',   os_data.get('data_entrega',   '')),
    ]
    for i, (lbl, val) in enumerate(datas):
        xb = M + i * third
        if i > 0:
            c.setStrokeColor(SILVER)
            c.line(xb, y - RH + 1*mm, xb, y - 1*mm)
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Bold', 6.5)
        c.drawString(xb + 3*mm, y - RH + 2*mm, lbl)
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(xb + 24*mm, y - RH + 2*mm, val)
    y -= RH
    y -= 2.5*mm

    # ── DADOS DO CLIENTE ───────────────────────────────────────────────────
    y = section_header('Dados do Cliente', y)
    y = two_fields('Nome',     str(cli.get('nome')    or '').strip(), 'Apelido',      str(cli.get('apelido')     or '').strip(), y)
    y = two_fields('Telefone', str(cli.get('telefone')or '').strip(), 'Instagram',    str(cli.get('instagram')   or '').strip(), y, alt=True)
    y = two_fields('CPF',      str(cli.get('cpf')     or '').strip(), 'Nascimento',   str(cli.get('nascimento')  or '').strip(), y)
    y = field_row('Endereco',  str(cli.get('endereco') or '').strip(), y, lw=20*mm, alt=True)
    y = two_fields('Autoriza Instagram', str(cli.get('autoriza_instagram') or ''), 'Autoriza Lembretes', str(cli.get('autoriza_lembretes') or ''), y)
    y -= 2.5*mm

    # ── TERCEIRO AUTORIZADO ────────────────────────────────────────────────
    y = section_header('Terceiro Autorizado a Retirar o Veiculo', y)
    y = field_row('Nome',     _ter_nome or '___________________________________', y, lw=15*mm)
    y = two_fields('Telefone', _ter_tel or '____________________', 'CPF', _ter_cpf or '____________________', y, lw1=18*mm, lw2=12*mm, alt=True)
    y -= 2.5*mm

    # ── DETALHES DO SERVIÇO ────────────────────────────────────────────────
    y = section_header('Detalhes do Veiculo e Servico', y)
    y = field_row('Modelo / Ano / Cor', vei.get('modelo', ''), y, lw=35*mm)
    y = field_row('Servico Solicitado', vei.get('servico', ''), y, lw=42*mm, alt=True)
    y -= 2.5*mm

    # ── CHECKLIST ─────────────────────────────────────────────────────────
    y = section_header('Checklist de Inspecao', y)
    half = CW / 2

    # Linha 1: Chave | Gasolina
    checklist_item(M, y, 'Chave da MOTO', chk.get('chave', 'Nao'), half)
    c.setStrokeColor(SILVER)
    c.setLineWidth(0.3)
    c.line(M + half, y - RH + 1*mm, M + half, y - 1*mm)
    c.setFillColor(WHITE)
    c.rect(M + half, y - RH, half, RH, fill=1, stroke=0)
    c.setStrokeColor(SILVER)
    c.line(M + half, y - RH, M + CW, y - RH)
    c.setFillColor(MUTED)
    c.setFont('Helvetica-Bold', 6.8)
    c.drawString(M + half + 3*mm, y - RH + 2*mm, 'Nivel de Gasolina')
    gasolina_stars = int(chk.get('gasolina', 0))
    for i in range(5):
        c.setFillColor(AMBER if i < gasolina_stars else SILVER)
        c.setStrokeColor(colors.HexColor('#E0E0E0'))
        c.setLineWidth(0.2)
        c.circle(M + half + 32*mm + i*4.8*mm, y - RH/2, 1.7*mm, fill=1, stroke=1)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 6.5)
    c.drawString(M + half + 57*mm, y - RH + 2*mm, f'{gasolina_stars}/5')
    y -= RH

    # Linha 2: Motor | Elétrica
    checklist_item(M, y, 'Funcionamento do Motor', chk.get('motor', 'Nao'), half, alt=True)
    c.setStrokeColor(SILVER)
    c.line(M + half, y - RH + 1*mm, M + half, y - 1*mm)
    checklist_item(M + half, y, 'Eletrica', chk.get('eletrica', 'Nao'), half, alt=True)
    y -= RH

    # Observações
    obs_h = 18*mm
    c.setFillColor(WHITE)
    c.rect(M, y - obs_h, CW, obs_h, fill=1, stroke=0)
    c.setStrokeColor(SILVER)
    c.setLineWidth(0.5)
    c.roundRect(M, y - obs_h, CW, obs_h, 1.5*mm, fill=0, stroke=1)
    c.setFillColor(MUTED)
    c.setFont('Helvetica-Bold', 6.8)
    c.drawString(M + 3*mm, y - 4*mm, 'Observacoes')
    if obs:
        obs_lines = simpleSplit(obs, 'Helvetica', 6.5, CW - 6*mm)
        ty = y - 9*mm
        for line in obs_lines:
            c.setFillColor(BLACK)
            c.setFont('Helvetica', 6.5)
            c.drawString(M + 3*mm, ty, line)
            ty -= 8
    else:
        c.setFillColor(SILVER)
        c.setFont('Helvetica', 6.5)
        c.drawString(M + 3*mm, y - 9*mm, 'Nenhuma observacao registrada.')
    y -= obs_h
    y -= 2.5*mm

    # ── PEÇAS E SERVIÇOS ───────────────────────────────────────────────────
    y = section_header('Pecas e Servicos', y)
    c.setFillColor(CHARCOAL)
    c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(M, y - RH, 2.5*mm, RH, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 6.8)
    for cx, lbl in [(3*mm, 'DESCRICAO'), (CW*0.58, 'QTD'), (CW*0.72, 'VL. UNIT.'), (CW*0.87, 'TOTAL')]:
        c.drawString(M + cx, y - RH + 2*mm, lbl)
    y -= RH

    total_geral = fin.get('total', 'R$ 0,00')
    for i, peca in enumerate(pecas):
        c.setFillColor(ROW_ALT if i % 2 else WHITE)
        c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.3)
        c.line(M, y - RH, M + CW, y - RH)
        c.setFillColor(BLACK)
        c.setFont('Helvetica', 7)
        c.drawString(M + 3*mm,      y - RH + 2*mm, peca.get('descricao', ''))
        c.drawString(M + CW*0.58,   y - RH + 2*mm, peca.get('qtd', ''))
        c.drawString(M + CW*0.72,   y - RH + 2*mm, peca.get('valor_unit', ''))
        c.setFont('Helvetica-Bold', 7)
        c.drawString(M + CW*0.87,   y - RH + 2*mm, peca.get('total', ''))
        y -= RH

    c.setFillColor(ACCENT_DARK)
    c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(M + 3*mm, y - RH + 2*mm, 'TOTAL GERAL')
    c.drawRightString(M + CW - 3*mm, y - RH + 2*mm, total_geral)
    y -= RH
    y -= 2.5*mm

    # ── RESUMO FINANCEIRO ──────────────────────────────────────────────────
    y = section_header('Resumo Financeiro', y)
    # Total O.S
    for label, val, alt in [('Total O.S', fin.get('total','R$ 0,00'), False)]:
        c.setFillColor(ROW_ALT if alt else WHITE)
        c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
        c.setStrokeColor(SILVER); c.setLineWidth(0.3)
        c.line(M, y - RH, M + CW, y - RH)
        c.setFillColor(MUTED); c.setFont('Helvetica-Bold', 6.8)
        c.drawString(M + 3*mm, y - RH + 2*mm, label)
        c.setFillColor(BLACK); c.setFont('Helvetica-Bold', 7)
        c.drawRightString(M + CW - 3*mm, y - RH + 2*mm, val)
        y -= RH

    # Recebido (total)
    c.setFillColor(ROW_ALT)
    c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
    c.setStrokeColor(SILVER); c.setLineWidth(0.3)
    c.line(M, y - RH, M + CW, y - RH)
    c.setFillColor(MUTED); c.setFont('Helvetica-Bold', 6.8)
    c.drawString(M + 3*mm, y - RH + 2*mm, 'Recebido')
    c.setFillColor(BLACK); c.setFont('Helvetica-Bold', 7)
    c.drawRightString(M + CW - 3*mm, y - RH + 2*mm, fin.get('recebido','R$ 0,00'))
    y -= RH

    # detalhe de cada pagamento (sublinhas)
    for pd in fin.get('payments_detail', []):
        amt_s  = fmt_brl(pd['amount'])
        met_s  = pd.get('method','')
        nome_s = pd.get('name','')
        col1 = f"  • {met_s}  {amt_s}"
        col2 = f"Recebido por: {nome_s}" if nome_s else ''
        c.setFillColor(WHITE)
        c.rect(M, y - SH, CW, SH, fill=1, stroke=0)
        c.setFillColor(STEEL); c.setFont('Helvetica', 6.3)
        c.drawString(M + 6*mm, y - SH + 1.5*mm, col1)
        if col2:
            c.setFillColor(MUTED)
            c.drawRightString(M + CW - 3*mm, y - SH + 1.5*mm, col2)
        y -= SH

    # Desconto
    c.setFillColor(WHITE)
    c.rect(M, y - RH, CW, RH, fill=1, stroke=0)
    c.setStrokeColor(SILVER); c.setLineWidth(0.3)
    c.line(M, y - RH, M + CW, y - RH)
    c.setFillColor(MUTED); c.setFont('Helvetica-Bold', 6.8)
    c.drawString(M + 3*mm, y - RH + 2*mm, 'Desconto')
    c.setFillColor(BLACK); c.setFont('Helvetica-Bold', 7)
    c.drawRightString(M + CW - 3*mm, y - RH + 2*mm, fin.get('desconto','R$ 0,00'))
    y -= RH

    # ── TERMOS E ASSINATURAS ───────────────────────────────────────────────
    y = section_header('Termos e Assinaturas', y)

    inspect_text = ('Declaro que o checklist de inspecao do veiculo foi realizado e conferido no ato do atendimento, '
                    'estando ciente das condicoes registradas e autorizando a execucao dos servicos descritos nesta '
                    'Ordem de Servico. Estou ciente do prazo de ate 30 dias para retirada apos a conclusao. '
                    'Apos esse periodo, sera cobrada taxa de estada de R$ 6,00/dia.')
    deliver_text  = ('Declaro que recebi nesta data a motocicleta referente a esta Ordem de Servico, apos a execucao '
                    'dos servicos descritos. Confirmo que o veiculo foi entregue, conferido e encontra-se sem '
                    'irregularidades aparentes no ato da entrega.')

    gap     = 3*mm
    hw      = (CW - gap) / 2
    tag_h   = 4.5*mm
    pad_top = tag_h + 2*mm
    pad_bot = 2*mm
    line_h  = 7.5

    lines_i = simpleSplit(inspect_text, 'Helvetica', 6, hw - 6*mm)
    lines_d = simpleSplit(deliver_text, 'Helvetica', 6, hw - 6*mm)
    th_max  = max(
        pad_top + len(lines_i) * line_h + pad_bot,
        pad_top + len(lines_d) * line_h + pad_bot,
    )

    for ox, lines, lbl in [(M, lines_i, 'Termo de Inspecao'), (M + hw + gap, lines_d, 'Termo de Entrega')]:
        box_top = y
        box_bot = y - th_max
        c.setFillColor(CLOUD)
        c.roundRect(ox, box_bot, hw, th_max, 1.5*mm, fill=1, stroke=0)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.4)
        c.roundRect(ox, box_bot, hw, th_max, 1.5*mm, fill=0, stroke=1)
        c.setFillColor(CHARCOAL)
        c.roundRect(ox, box_top - tag_h, hw, tag_h, 1.5*mm, fill=1, stroke=0)
        c.rect(ox, box_top - tag_h, hw, tag_h / 2, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 6.5)
        c.drawString(ox + 3*mm, box_top - tag_h + 1.5*mm, lbl.upper())
        ty = box_top - pad_top
        for line in lines:
            c.setFillColor(STEEL)
            c.setFont('Helvetica', 6)
            c.drawString(ox + 3*mm, ty, line)
            ty -= line_h

    y -= th_max + 2.5*mm

    # Caixas de assinatura com imagem base64 se disponivel
    sig_h = 26*mm
    import base64, tempfile
    for ox, lbl, sig_b64 in [
        (M,           'Assinatura do Cliente - Inspecao', sig_inspecao),
        (M + hw + gap,'Assinatura do Cliente - Entrega',  sig_entrega),
    ]:
        c.setFillColor(WHITE)
        c.setStrokeColor(SILVER)
        c.setLineWidth(0.5)
        c.roundRect(ox, y - sig_h, hw, sig_h, 1.5*mm, fill=1, stroke=1)
        # Tenta renderizar imagem base64
        sig_rendered = False
        if sig_b64 and ',' in str(sig_b64):
            try:
                header, b64data = str(sig_b64).split(',', 1)
                img_bytes = base64.b64decode(b64data)
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                tmp.write(img_bytes)
                tmp.close()
                pad = 3*mm
                c.drawImage(tmp.name, ox + pad, y - sig_h + pad,
                            width=hw - 2*pad, height=sig_h - 2*pad,
                            preserveAspectRatio=True, anchor='c', mask='auto')
                os.unlink(tmp.name)
                sig_rendered = True
            except:
                pass
        if not sig_rendered:
            c.setStrokeColor(SILVER)
            c.line(ox + 5*mm, y - sig_h + 8*mm, ox + hw - 5*mm, y - sig_h + 8*mm)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 6)
        c.drawCentredString(ox + hw/2, y - sig_h + 3*mm, lbl)

    c.save()


# ---------------------------------------------------------------------------
# API FLASK
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)

@app.route('/gerar-os', methods=['POST'])
def gerar_os():
    """
    Recebe JSON com os dados da O.S e retorna o PDF para download.

    Exemplo de chamada no frontend (JavaScript):
    ─────────────────────────────────────────────
    const response = await fetch('http://localhost:5000/gerar-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosOS)
    });
    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    window.open(url);   // abre o PDF numa nova aba
    // — ou para download direto:
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ordem_servico.pdf';
    a.click();
    """
    dados = request.get_json(force=True)
    if not dados:
        return jsonify({'erro': 'JSON invalido ou ausente'}), 400

    # LOG: mostra no terminal as chaves recebidas para debug
    import json as _json
    chaves = list(dados.keys())
    print(f"\n[DEBUG] Chaves recebidas ({len(chaves)}): {chaves}")
    print(f"[DEBUG] is_flat detect: client_name={'client_name' in dados}, equipment={'equipment' in dados}")
    for campo in ['client_name','client_apelido','mechanic_name','autoriza_instagram']:
        print(f"[DEBUG]   {campo} = {repr(dados.get(campo))[:80]}")
    print(f"[DEBUG] checklist_items COMPLETO:")
    for item in (dados.get('checklist_items') or []):
        print(f"[DEBUG]   {_json.dumps(item, ensure_ascii=False)}")

    # Define caminho da logo relativo ao script
    if 'logo_path' not in dados:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        dados['logo_path'] = os.path.join(base_dir, 'bandara_logo_transparent.png')

    # Gera PDF em memória
    buffer = io.BytesIO()
    try:
        create_os_pdf(buffer, dados)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

    buffer.seek(0)
    numero_os = (dados.get('id') or dados.get('os', {}).get('numero') or 'os')
    numero_os = str(numero_os)[:8]
    filename  = f'ordem_servico_{numero_os}.pdf'

    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'servico': 'Bandara OS PDF Generator'})


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    # Teste rápido ao rodar diretamente
    # Dados de teste no formato EXATO do banco
    dados_teste = {
        "id":                  "dd1d486b-95ab-4fcf-bdfb-92cf161e3ce1",
        "status":              "concluida_entregue",
        "mechanic_name":       "Matheus",
        "created_by":          "Matheus",
        "entry_date":          "2026-03-09T15:00:00+00:00",
        "conclusion_date":     "2026-03-10T22:53:20.192",
        "exit_date":           "2026-03-09T15:00:00+00:00",
        "client_name":         "Matheus",
        "client_apelido":      "bollynho",
        "client_phone":        "75988388629",
        "autoriza_instagram":  True,
        "autoriza_lembretes":  True,
        "equipment":           "HONDA CG 125 1981 VERMELHA (SEM), DSA DSA DSA 2022 DSA (TDSA)",
        "problem_description": "TESTE\n\nRetirada: Cliente",
        "checklist_items": [
            {"name": "Chave da MOTO",         "status": "true"},
            {"name": "Funcionamento do Motor", "status": "false"},
            {"name": "Eletrica",               "status": "false"},
            {"name": "Nivel de Gasolina",      "status": "2"},
        ],
        "materials": [
            {"name": "Oleo",          "quantity": 1, "price": "0.00"},
            {"name": "Disco freio",   "quantity": 1, "price": "0.00"},
            {"name": "Pastilha freio","quantity": 1, "price": "0.00"},
        ],
        "payments": [],
    }
    create_os_pdf('ordem_servico_bandara.pdf', dados_teste)
    print("PDF de teste gerado: ordem_servico_bandara.pdf")
    print("\nPara iniciar a API Flask:")
    print("  python bandara_os_api.py  ->  acesse http://localhost:5000/gerar-os")
    app.run(debug=True, port=5000)
