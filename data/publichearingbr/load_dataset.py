import json

file_public_hearing_br_lds = './PublicHearingBR_LDS.jsonl'
file_public_hearing_br_nli = './PublicHearingBR_NLI.jsonl'

def load_jsonl(filename):
    dataset = []
    with open(filename, encoding='utf-8') as fin:
        for line in fin:
            dataset.append(json.loads(line))
    return dataset

def print_phbr_lds(n=206):
    for sample in phbr_lds[0:n]:
        id = sample['id']
        transcricao = sample['transcricao'] # long document
        materia = sample['materia'] # summary
        metadados = sample['metadados'] # structured summary
        
        print(f"\n########## ID: {id}")
        for envolvido in metadados['envolvidos']:
            cargo = envolvido['cargo']
            nome = envolvido['nome']
            opinioes = envolvido['opinioes']
            
            print(f"\n\tNome: {nome}")
            print(f"\tCargo: {cargo}")
            print("\tOpiniões:")
            for opiniao in opinioes:
                print(f"\t\t- {opiniao}")              

def print_phbr_nli(n=206):
    for sample in phbr_nli[0:n]:
        id = sample['id']
        metadados_extraidos = sample['metadados_extraidos']
        
        print(f"\n########## ID: {id}")
        for envolvido in metadados_extraidos['envolvidos']:
            nome = envolvido['nome']    # Nome identificado na extração pelo experimento
            cargo = envolvido['cargo']  # Cargo identificado na extração pelo experimento
            
            print(f"\n\t\tNome: {nome}")
            for n_opiniao, opiniao in enumerate(envolvido['opinioes'], 1):
                desc_opiniao = opiniao['opiniao']
                chunks_proximos = opiniao['chunks_proximos']
                verificao_alucinacao = opiniao['verificacao_alucinacao']
                verificacao_manual = verificao_alucinacao['verificacao_manual']
                verificacao_automatica_prompt_1 = verificao_alucinacao['prompt_1_gpt-4o-mini-2024-07-18']['alucinacao']
                verificacao_automatica_prompt_2 = verificao_alucinacao['prompt_2_gpt-4o-mini-2024-07-18']['alucinacao']
                verificacao_automatica_prompt_3 = verificao_alucinacao['prompt_3_gpt-4o-mini-2024-07-18']['alucinacao']
                
                print(f"\t\t - {n_opiniao}:{desc_opiniao}")
                print(f"\t\t\t Alucinação (manual):   {verificacao_manual}")
                print(f"\t\t\t Alucinação (prompt 1): {verificacao_automatica_prompt_1}")
                print(f"\t\t\t Alucinação (prompt 2): {verificacao_automatica_prompt_2}")
                print(f"\t\t\t Alucinação (prompt 3): {verificacao_automatica_prompt_3}")


phbr_lds = load_jsonl(file_public_hearing_br_lds)
phbr_nli = load_jsonl(file_public_hearing_br_nli)

# Imprime os datasets
print_phbr_lds()
print_phbr_nli()