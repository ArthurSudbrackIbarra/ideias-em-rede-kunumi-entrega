"""Validadores da anotação v3 (spec §4.4 e §15): guardas de número e cópia, gramática do gist, tamanhos,
consistência das teses e do glossário. Tudo sobre uma audiência sintética pequena, sem o dataset."""
from __future__ import annotations

import copy

import pytest

from sim.annotate_sim import CopyGuard, numbers, validate_response

SENTENCES = {
    "b001": ["Declaro aberta a reunião de audiência pública sobre o licenciamento do bloco.", "Passo a palavra ao primeiro expositor."],
    "b002": [
        "A produção brasileira de petróleo tende a cair a partir de 2029, segundo as nossas projeções.",
        "Sem novas fronteiras, o país volta a importar petróleo em poucos anos.",
        "O pré-sal das bacias de Campos e Santos já está em declínio de produção.",
        "Precisamos de novas áreas e a Margem Equatorial é a principal delas, com royalties para os estados.",
    ],
    "b003": [
        "Nós, trabalhadores, também vemos que a produção cai em 2029 e defendemos abrir novas fronteiras.",
        "Isso é política de Estado e não pode depender de dividendos.",
        "Mas a AAAS, a avaliação ambiental de área sedimentar, nunca foi feita nesta região.",
        "Sem esse estudo regional, os técnicos não conseguem decidir com segurança.",
    ],
    "b004": [
        "Segurança energética não justifica abrir novos poços em plena crise climática.",
        "A Agência Internacional de Energia diz que o mundo não deveria perfurar poços novos desde 2021.",
        "A riqueza do petróleo, se vier, tem de ficar com a região mais pobre do país.",
        "Pergunto ao governo: a sonda levada ao bloco estava autorizada?",
    ],
    "b005": [
        "O licenciamento é o instrumento que atesta a viabilidade ambiental de um empreendimento.",
        "O parecer dos técnicos tem 23 páginas e se baseia nos estudos da própria empresa.",
        "Os royalties precisam chegar aos municípios que preservam a floresta.",
        "Hoje 63% da população do Amapá está no CadÚnico, o cadastro dos programas sociais.",
    ],
    "b006": [
        "A riqueza do subsolo deve financiar a região mais pobre do Brasil.",
        "O BOP, o equipamento que fecha o poço em emergência, fica a 2.880 metros de profundidade.",
        "Promessas anteriores de desenvolvimento não se cumpriram no Amapá.",
        "Peço que a Comissão acompanhe o caso com um cronograma.",
    ],
    "b007": ["Os royalties do petróleo têm de financiar a saúde e a educação dos municípios do Amapá.", "Não podemos perder mais tempo."],
}
SPEAKER_OF = {"b001": "s01", "b002": "s02", "b003": "s03", "b004": "s04", "b005": "s02", "b006": "s04", "b007": "s05"}
FALA_THEME = {"b002": "d1", "b003": "d1", "b004": "d2", "b005": "d3", "b006": "d4", "b007": "d4"}


def make_prompt() -> dict:
    return {
        "id": 999, "fala_ids": list(SENTENCES), "sentence_counts": {k: len(v) for k, v in SENTENCES.items()},
        "sentences": SENTENCES, "article_sentences": 3, "speaker_ids": ["s01", "s02", "s03", "s04", "s05"],
        "speaker_names": {"s01": "Presidente", "s02": "Carlos", "s03": "Deyvid", "s04": "Ivan", "s05": "Acácio"},
    }


def claim(cid: str, sents: list[int], theme: str, position: str, gist: str, plain: str, ctype: str = "dado") -> dict:
    return {"id": cid, "sentences": sents, "type": ctype, "theme": theme, "strength": "forte", "position": position, "gist": gist, "plain": plain}


def fala(fid: str, claims: list[dict], stance_pos: str, open_q: int | None = None) -> dict:
    return {
        "id": fid, "speaker": SPEAKER_OF[fid], "kind": "substantive", "theme": FALA_THEME[fid],
        "summary": f"Defende a posição principal da fala {fid} sobre o tema.", "quote": [0, 1], "covered": False, "evidence": [],
        "open_question": open_q, "stance": {"position": stance_pos, "claim": f"Posição da fala {fid}, na voz do analista.", "sentence": 0},
        "claims": claims, "tone": "politico", "interrupted": False, "mesa_move": None,
    }


def make_resp() -> dict:
    axis = lambda pro, contra: {"pro": pro, "contra": contra, "pro_plain": pro, "contra_plain": contra}  # noqa: E731
    return {
        "synopsis": "Audiência sintética sobre a perfuração de um bloco de petróleo e o legado para a região.",
        "stakes": "Decidir se o poço é autorizado e sob quais condições.",
        "central_question": "O poço deve ser autorizado antes de um estudo regional?",
        "synopsis_plain": "Uma audiência sobre um poço de petróleo no mar do Amapá: quem quer perfurar já e quem quer estudo antes.",
        "stakes_plain": "Se o poço é autorizado ou não, e com que condições.",
        "central_question_plain": "O poço pode ser autorizado antes de um estudo de toda a região?",
        "themes": [
            {"id": "d1", "name": "Segurança energética", "description": "Se o país precisa de novas áreas de petróleo.",
             "axis": axis("Sem novas áreas o país volta a importar petróleo.", "Não é preciso abrir novas áreas."), "contested": True},
            {"id": "d2", "name": "Clima", "description": "Petróleo novo e a crise do clima.",
             "axis": axis("O clima permite novos poços.", "A crise do clima não permite novos poços."), "contested": True},
            {"id": "d3", "name": "Licenciamento", "description": "Como a licença é decidida.",
             "axis": axis("A licença deve sair agora.", "Falta estudo para decidir."), "contested": True},
            {"id": "d4", "name": "Royalties e legado", "description": "Quem fica com a riqueza do petróleo.",
             "axis": axis("A riqueza deve ficar com a região mais pobre.", "Promessas anteriores não se cumpriram."), "contested": True},
        ],
        "speakers": {
            "s01": {"role": "mesa", "cargo": "Presidente da Comissão", "org": "Comissão de Meio Ambiente", "basis": "b001.0", "seat": "mesa",
                    "gov_level": None, "byline": None, "org_plain": "a comissão da Câmara que organizou a audiência"},
            "s02": {"role": "governo", "cargo": "Coordenador no Ministério de Minas e Energia", "org": "MME", "basis": "b002.0", "seat": "debatedores",
                    "gov_level": "federal", "byline": "do Ministério de Minas e Energia", "org_plain": "ministério do governo federal que cuida de petróleo e energia"},
            "s03": {"role": "sociedade_civil", "cargo": "Coordenador da FUP", "org": "FUP", "basis": "b003.0", "seat": "debatedores",
                    "gov_level": None, "byline": "da FUP, a federação dos petroleiros", "org_plain": "federação dos sindicatos dos trabalhadores do petróleo"},
            "s04": {"role": "parlamentar", "cargo": "Deputado Federal (PSOL-SP)", "org": "Câmara dos Deputados (PSOL-SP)", "basis": "ata", "seat": "bancada",
                    "gov_level": None, "byline": "deputado federal pelo PSOL de São Paulo", "org_plain": "deputado eleito por São Paulo"},
            "s05": {"role": "parlamentar", "cargo": "Deputado Federal (MDB-AP)", "org": "Câmara dos Deputados (MDB-AP)", "basis": "ata", "seat": "bancada",
                    "gov_level": None, "byline": "deputado federal pelo Amapá", "org_plain": "deputado eleito pelo Amapá"},
        },
        "audience": {"estimate": 20, "composition": [{"role": "sociedade_civil", "share": 1.0}], "basis": "sem pista", "confidence": "baixa"},
        "falas": [
            {"id": "b001", "speaker": "s01", "kind": "procedural", "theme": None, "summary": "A presidência abre a reunião e passa a palavra ao primeiro expositor.",
             "quote": [], "covered": False, "evidence": [], "open_question": None, "stance": None, "claims": [], "tone": "politico",
             "interrupted": False, "mesa_move": "abre"},
            fala("b002", [
                claim("b002c1", [0, 1], "d1", "favoravel", "a produção cai a partir de 2029 e o país pode voltar a importar petróleo",
                      "A produção de petróleo do Brasil deve cair a partir de 2029. Se não abrirmos áreas novas, vamos voltar a importar em poucos anos."),
                claim("b002c2", [2, 3], "d2", "favoravel", "o pré-sal está em declínio e a Margem Equatorial é a principal área nova",
                      "O pré-sal de Campos e Santos já produz menos. Precisamos de áreas novas, e a Margem Equatorial é a principal, com royalties para os estados.", "economico"),
            ], "favoravel"),
            fala("b003", [
                claim("b003c1", [0, 1], "d1", "favoravel", "os trabalhadores também veem a queda em 2029 e defendem novas fronteiras",
                      "Nós também vemos a queda em 2029 e queremos novas fronteiras. Isso é política de Estado, não coisa de acionista.", "principio"),
                claim("b003c2", [2, 3], "d3", "contrario", "a AAAS nunca foi feita e os técnicos não conseguem decidir com segurança",
                      "A AAAS, o estudo ambiental de toda a região, nunca foi feita aqui. Sem ela, os técnicos não têm base para decidir.", "juridico"),
            ], "favoravel"),
            fala("b004", [
                claim("b004c1", [0, 1], "d2", "contrario", "segurança energética não justifica poços novos e a AIE pede parar desde 2021",
                      "Segurança energética não é motivo para abrir poços novos no meio da crise do clima. A Agência Internacional de Energia pede que ninguém perfure poço novo desde 2021.", "principio"),
                claim("b004c2", [2], "d4", "favoravel", "a riqueza do petróleo tem de ficar com a região mais pobre do país",
                      "Se a riqueza do petróleo vier, ela tem de ficar com a região mais pobre do país.", "principio"),
            ], "contrario", open_q=3),
            fala("b005", [
                claim("b005c1", [0, 1], "d3", "contrario", "o licenciamento atesta a viabilidade e o parecer de 23 páginas usa os estudos da empresa",
                      "É o licenciamento que diz se um projeto pode ou não ser feito. O parecer dos técnicos tem 23 páginas e usa os estudos da própria empresa.", "juridico"),
                claim("b005c2", [2, 3], "d4", "favoravel", "os royalties precisam chegar aos municípios e 63% do Amapá está no CadÚnico",
                      "Os royalties têm de chegar aos municípios que preservam a floresta. Hoje 63% do povo do Amapá está no CadÚnico, o cadastro dos programas sociais."),
            ], "contrario"),
            fala("b006", [
                claim("b006c1", [0, 1], "d4", "favoravel", "a riqueza do subsolo deve financiar a região mais pobre e o BOP fica a 2.880 metros",
                      "A riqueza que está no subsolo deve pagar o desenvolvimento da região mais pobre. O BOP, a válvula que fecha o poço numa emergência, fica a 2880 metros."),
                claim("b006c2", [2, 3], "d4", "contrario", "promessas anteriores não se cumpriram no Amapá",
                      "Outras promessas de desenvolvimento não foram cumpridas no Amapá. Peço à Comissão que acompanhe este caso e marque um cronograma.", "precedente"),
            ], "favoravel"),
            fala("b007", [
                claim("b007c1", [0], "d4", "favoravel", "os royalties têm de financiar saúde e educação nos municípios do Amapá",
                      "O dinheiro dos royalties tem de pagar saúde e educação nos municípios do Amapá.", "economico"),
            ], "favoravel"),
        ],
        "relations": [
            {"from": "b004", "to": "b002", "kind": "contradiz", "from_sentence": 0, "to_sentence": 1, "from_claim": "b004c1", "to_claim": "b002c1",
             "strength": "forte", "note": "Nega que segurança energética justifique novos poços."},
            {"from": "b003", "to": "b002", "kind": "apoia", "from_sentence": 0, "to_sentence": 0, "from_claim": "b003c1", "to_claim": "b002c1",
             "strength": "media", "note": "Repete a queda a partir de 2029."},
        ],
        "consensus": [
            {"theme": "d4", "falas": ["b004", "b005", "b006"], "claims": ["b004c2", "b005c2", "b006c1"],
             "note": "Deputado, ministério e outro deputado concordam que a riqueza deve ficar com a região mais pobre."},
        ],
        "open_questions": [
            {"id": "q1", "from": "b004", "sentence": 3, "addressed_to": "governo", "answered_by": None, "gist": "A sonda estava autorizada?",
             "plain": "A sonda levada ao bloco tinha autorização?", "theme": "d3", "position": "neutro"},
        ],
        "facts": [
            {"id": "f1", "fala": "b002", "sentence": 0, "gist": "a produção cai a partir de 2029", "disputed_by": []},
            {"id": "f2", "fala": "b005", "sentence": 1, "gist": "o parecer tem 23 páginas", "disputed_by": []},
            {"id": "f3", "fala": "b006", "sentence": 1, "gist": "o BOP fica a 2.880 metros", "disputed_by": []},
        ],
        "press": {"themes_covered": ["d1"], "roles_quoted": ["governo"], "angle": "A matéria destaca a queda da produção.",
                  "omitted": "Os royalties e a pergunta sobre a sonda ficaram de fora."},
        "teses": [
            {"id": "t1", "title": "Sem novas áreas, o Brasil volta a importar petróleo",
             "statement_plain": "O Brasil precisa abrir áreas novas de petróleo, senão volta a importar em poucos anos.",
             "core_theme": "d1", "positions": {"d1": "favoravel", "d2": "favoravel"}, "claims_chave": ["b002c1", "b003c1", "b002c2"],
             "note": "Ministério e sindicato do mesmo lado."},
            {"id": "t2", "title": "Sem estudo regional, o poço não pode ser autorizado",
             "statement_plain": "Não dá para autorizar o poço antes de um estudo de toda a região, e o clima não permite poços novos.",
             "core_theme": "d3", "positions": {"d2": "contrario", "d3": "contrario"}, "claims_chave": ["b004c1", "b003c2", "b005c1"],
             "note": "Deputado, sindicato e ministério concordam em pontos diferentes."},
            {"id": "t3", "title": "A riqueza do petróleo tem que ficar com a região mais pobre",
             "statement_plain": "Se o petróleo vier, o dinheiro tem que ficar com quem preserva e passa necessidade.",
             "core_theme": "d4", "positions": {"d4": "favoravel"}, "claims_chave": ["b004c2", "b005c2", "b006c1"],
             "note": "Parlamentares e governo do mesmo lado."},
        ],
        "glossario": [
            {"term": "AAAS", "plain": "estudo ambiental de toda uma região do mar, feito antes de leiloar blocos", "fala": "b003", "sentence": 2},
            {"term": "pré-sal", "plain": "camada de petróleo muito profunda, abaixo de uma camada de sal", "fala": "b002", "sentence": 2},
            {"term": "royalties", "plain": "parte do dinheiro do petróleo paga a estados e municípios", "fala": "b002", "sentence": 3},
            {"term": "BOP", "plain": "válvula de segurança que fecha o poço numa emergência", "fala": "b006", "sentence": 1},
            {"term": "CadÚnico", "plain": "cadastro das famílias de baixa renda para programas sociais", "fala": "b005", "sentence": 3},
            {"term": "licenciamento", "plain": "processo em que o órgão ambiental decide se um projeto pode ser feito", "fala": "b005", "sentence": 0},
        ],
    }


def errors(resp: dict) -> list[str]:
    errs, _ = validate_response(resp, make_prompt())
    return errs


def warnings(resp: dict) -> list[str]:
    _, warns = validate_response(resp, make_prompt())
    return warns


def set_claim(resp: dict, cid: str, **fields) -> dict:
    for f in resp["falas"]:
        for c in f.get("claims", []):
            if c["id"] == cid:
                c.update(fields)
                return resp
    raise KeyError(cid)


def test_fixture_is_valid():
    errs, warns = validate_response(make_resp(), make_prompt())
    assert errs == []
    assert warns == []


def test_numbers_normalization():
    assert numbers("2.880 metros e 3,5 graus em 2029") == {"2880", "35", "2029"}
    assert numbers("nenhum número") == set()


def test_digit_guard_rejects_changed_number():
    resp = set_claim(make_resp(), "b002c1", plain="A produção de petróleo do Brasil deve cair a partir de 2030. Se não abrirmos áreas novas, vamos voltar a importar.")
    errs = errors(resp)
    assert any("b002c1.plain" in e and "2030" in e for e in errs)


def test_digit_guard_accepts_separator_variants():
    # o original tem "2.880"; a versão simples escreve "2880" e passa
    resp = set_claim(make_resp(), "b006c1", plain="A riqueza do subsolo deve pagar a região mais pobre. O BOP fica a 2880 metros de profundidade.")
    assert not [e for e in errors(resp) if "b006c1" in e]
    resp = set_claim(make_resp(), "b006c1", gist="o BOP fica a 2.880 metros e a riqueza deve financiar a região mais pobre")
    assert not [e for e in errors(resp) if "b006c1" in e]


def test_digit_guard_applies_to_gist_and_questions():
    resp = set_claim(make_resp(), "b005c1", gist="o parecer de 24 páginas usa os estudos da empresa")
    assert any("b005c1.gist" in e and "24" in e for e in errors(resp))
    resp = make_resp()
    resp["open_questions"][0]["plain"] = "A sonda levada ao bloco em 2022 tinha autorização?"
    assert any("open_question q1.plain" in e and "2022" in e for e in errors(resp))


def test_copy_guard_twelve_words():
    guard = CopyGuard(SENTENCES)
    assert guard.copied("a produção brasileira de petróleo tende a cair a partir de 2029, dizem")
    assert not guard.copied("a produção brasileira de petróleo tende a cair a partir de agora")
    twelve = "A produção brasileira de petróleo tende a cair a partir de 2029, e isso preocupa."
    resp = set_claim(make_resp(), "b002c1", plain=twelve)
    assert any("b002c1.plain" in e and "consecutivas" in e for e in errors(resp))
    eleven = "A produção brasileira de petróleo tende a cair a partir de agora mesmo, dizem eles."
    resp = set_claim(make_resp(), "b002c1", plain=eleven)
    assert not [e for e in errors(resp) if "b002c1" in e]


def test_gist_grammar():
    resp = set_claim(make_resp(), "b002c1", gist="A produção cai a partir de 2029")
    assert any("b002c1.gist deve começar em minúscula" in e for e in errors(resp))
    resp = set_claim(make_resp(), "b002c1", gist="a produção cai a partir de 2029.")
    assert any("b002c1.gist não termina com ponto" in e for e in errors(resp))
    resp = set_claim(make_resp(), "b002c1", gist="a produção cai a partir de 2029 " + "e cai " * 40)
    assert any("b002c1.gist" in e and "máximo 140" in e for e in errors(resp))


def test_lengths_and_question_marks():
    resp = make_resp()
    resp["central_question_plain"] = "O poço pode ser autorizado antes de um estudo de toda a região"
    assert any("central_question_plain deve terminar com '?'" in e for e in errors(resp))
    resp = set_claim(make_resp(), "b002c1", plain="Curto demais.")
    assert any("b002c1.plain" in e and "esperado 20–240" in e for e in errors(resp))
    resp = make_resp()
    resp["speakers"]["s02"]["byline"] = "Do Ministério de Minas e Energia"
    assert any("byline deve começar em minúscula" in e for e in errors(resp))
    resp = make_resp()
    resp["speakers"]["s02"]["org_plain"] = None
    assert any("s02.org_plain ausente" in e for e in errors(resp))
    resp = make_resp()
    resp["falas"][0]["summary"] = "Abre a reunião e passa a palavra."
    assert any("b001.summary da presidência" in e for e in errors(resp))


def test_position_required_on_every_card():
    resp = set_claim(make_resp(), "b002c1", position="talvez")
    assert any("b002c1.position inválida" in e for e in errors(resp))


def test_tese_claim_outside_theme():
    resp = make_resp()
    resp["teses"][2]["claims_chave"] = ["b004c2", "b005c2", "b002c1"]  # b002c1 é d1, a tese só toma lado em d4
    assert any("tese t3: carta-chave b002c1 está no tema d1" in e for e in errors(resp))


def test_tese_claim_wrong_side():
    resp = make_resp()
    resp["teses"][2]["claims_chave"] = ["b004c2", "b005c2", "b006c2"]  # b006c2 é contrario em d4
    assert any("tese t3: carta-chave b006c2 está do lado 'contrario'" in e for e in errors(resp))


def test_tese_single_speaker_is_error_and_single_role_is_warning():
    resp = make_resp()
    resp["teses"][2]["claims_chave"] = ["b004c2", "b006c1", "b004c2"]  # só s04
    assert any("tese t3: claims_chave de um só orador" in e for e in errors(resp))
    resp = make_resp()
    resp["teses"][2]["claims_chave"] = ["b004c2", "b006c1", "b007c1"]  # s04 e s05, ambos parlamentares
    assert not [e for e in errors(resp) if "tese t3" in e]
    assert any("tese t3: todas as cartas-chave vêm de um só papel" in w for w in warnings(resp))


def test_teses_need_an_opposing_pair():
    resp = make_resp()
    resp["teses"][1]["positions"] = {"d3": "contrario"}
    resp["teses"][1]["core_theme"] = "d3"
    resp["teses"][1]["claims_chave"] = ["b003c2", "b005c1", "b003c2"]
    assert any("nenhum par de teses se opõe" in e for e in errors(resp))


def test_teses_count_and_core_theme():
    resp = make_resp()
    resp["teses"] = resp["teses"][:2]
    assert any("teses: esperado lista com 3–6" in e for e in errors(resp))
    resp = make_resp()
    resp["teses"][0]["core_theme"] = "d4"
    assert any("tese t1: core_theme 'd4' não está em positions" in e for e in errors(resp))


def test_glossary_term_must_exist():
    resp = make_resp()
    resp["glossario"][0] = {"term": "ZZZ", "plain": "termo que não existe", "fala": "b003", "sentence": 2}
    assert any("glossário 'ZZZ': não aparece em b003.2" in e for e in errors(resp))
    resp = make_resp()
    resp["glossario"] = resp["glossario"][:3]
    assert any("glossario: esperado lista com 6–15" in e for e in errors(resp))


def test_plain_required_on_every_card():
    # v3: toda carta tem plain (revisão leve quando o original já é simples); null é erro, não aviso
    resp = set_claim(make_resp(), "b002c2", plain=None)
    assert any("b002c2.plain ausente" in e for e in errors(resp))
    resp = set_claim(make_resp(), "b002c2", plain="   ")
    assert any("b002c2.plain ausente" in e for e in errors(resp))


def test_semicolon_rejected_in_free_texts():
    resp = set_claim(make_resp(), "b002c1", plain="A produção deve cair a partir de 2029; sem áreas novas, vamos voltar a importar.")
    assert any("b002c1.plain" in e and "ponto e vírgula" in e for e in errors(resp))
    resp = make_resp()
    resp["teses"][0]["statement_plain"] = "O Brasil precisa de áreas novas; senão importa."
    assert any("tese t1.statement_plain" in e and "ponto e vírgula" in e for e in errors(resp))
    resp = make_resp()
    resp["glossario"][0]["plain"] = "estudo de uma região inteira; feito antes do leilão"
    assert any("glossario[AAAS].plain" in e and "ponto e vírgula" in e for e in errors(resp))


def test_open_question_theme_and_position():
    resp = make_resp()
    resp["open_questions"][0]["theme"] = "d9"
    resp["open_questions"][0]["position"] = "condicional"
    errs = errors(resp)
    assert any("open_question q1: theme inválido" in e for e in errs)
    assert any("open_question q1: position inválida" in e for e in errs)


def test_to_claim_must_be_a_card_of_the_to_fala_and_match_the_sentence():
    resp = make_resp()
    resp["relations"][0]["to_claim"] = "b003c1"  # carta de outra fala
    assert any("to_claim 'b003c1' não existe na fala b002" in e for e in errors(resp))
    resp = make_resp()
    resp["relations"][0]["to_claim"] = "b002c2"  # a sentença 1 está em b002c1
    assert any("pertence à carta b002c1, não a b002c2" in e for e in errors(resp))


def test_anchors_are_mandatory_in_v4():
    resp = make_resp()
    del resp["relations"][0]["to_claim"]
    assert any("to_claim ausente (obrigatório" in e for e in errors(resp))
    resp = make_resp()
    del resp["relations"][0]["from_claim"]
    assert any("from_claim ausente (obrigatório" in e for e in errors(resp))
    # null com a sentença dentro de uma carta: tem de indicar a carta
    resp = make_resp()
    resp["relations"][0]["to_claim"] = None
    assert any("pertence à carta b002c1: indique to_claim" in e for e in errors(resp))
    resp = make_resp()
    resp["relations"][0]["from_claim"] = None
    assert any("pertence à carta b004c1: indique from_claim" in e for e in errors(resp))
    # to_sentence fora de carta (b004.3 é a pergunta, sem carta) e to_claim null: relação com a fala inteira, só aviso
    resp = make_resp()
    resp["relations"].append({"from": "b005", "to": "b004", "kind": "responde", "from_sentence": 0, "to_sentence": 3, "from_claim": "b005c1",
                              "to_claim": None, "strength": "media", "note": "Responde à pergunta sobre a autorização da sonda."})
    assert errors(resp) == []
    assert any("ancora na fala inteira" in w for w in warnings(resp))


def test_consensus_claims_rules():
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2", "b006c2", "b005c2"]  # b006c2 é contrária em d4
    assert any("mistura cartas favoráveis e contrárias" in e for e in errors(resp))
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2", "b005c1"]  # b005c1 é d3
    assert any("cartas de outro tema em claims" in e for e in errors(resp))
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2", "b005c2", "b007c1"]  # b007 não está em falas
    assert any("falas fora do grupo" in e for e in errors(resp))
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2", "b005c2"]
    assert errors(resp) == []


def test_consensus_claims_is_mandatory_and_roles_come_from_falas():
    resp = make_resp()
    del resp["consensus"][0]["claims"]
    assert any("claims obrigatório" in e for e in errors(resp))
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2"]
    assert any("ao menos duas cartas" in e for e in errors(resp))
    # as cartas podem ser de um só papel quando as falas do grupo têm papéis diferentes (b005 é governo e concorda na fala)
    resp = make_resp()
    resp["consensus"][0]["claims"] = ["b004c2", "b006c1"]
    assert errors(resp) == []
    resp["consensus"][0]["falas"] = ["b004", "b006"]  # dois parlamentares
    assert any("dois papéis diferentes" in e for e in errors(resp))


def test_v1_rules_still_hold():
    resp = copy.deepcopy(make_resp())
    resp["relations"][0]["from_sentence"] = 3  # fora da carta b004c1
    assert any("fora da carta b004c1" in e for e in errors(resp))
    resp = make_resp()
    resp["falas"][1]["claims"][0]["sentences"] = [0, 2]
    assert any("não consecutivas" in e for e in errors(resp))


if __name__ == "__main__":
    pytest.main([__file__])
