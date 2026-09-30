# PublicHearingBR: A Brazilian Portuguese Dataset of Public Hearing Transcripts for Summarization of Long Documents

PublicHearingBR é um dataset em português que pode ser usado para dois conjuntos de atividades: sumarização de longos documentos (LDS - long document summarization) e inferência em linguagem natural (NLI - natural language inference). Para isso, são disponibilizados dois arquivos: PublicHearingBR_LDS.jsonl e PublicHearingBR_NLI.jsonl.

O script `load_dataset.py` pode ser usado para carregar os datasets e imprimir a sua estrutura, conforme descrito nas próximas duas seções.

Para mais detalhes sobre o dataset consulte o artigo _"PublicHearingBR: A Brazilian Portuguese Dataset of Public Hearing Transcripts for Summarization of Long Documents"_.

## 1. PublicHearingBR_LDS - Long Document Summarization

O arquivo PublicHearingBR_LDS.jsonl contém 206 amostras para testes de sumarização de documentos longos (transcrições de audiências públicas). Considerando que `phbr_lds` é o dataset carregado do arquivo jsonl:

- `phbr_lds[0]` é a primeira amostra do dataset. A estrutura é um dict com 4 atributos:
    - `id`: um inteiro indicando o número da amostra (sequencial de 1 a 206)
    - `transcricao`: texto extraído da transcrição da audiência pública (long document)
    - `materia`: texto extraído da matéria jornalística (summary)
    - `metadados`: um dict contendo o sumário estruturado extraído da matéria (structured summary). O dict `metadados` possui duas chaves:
        - `assunto`: o assunto principal da matéria
        - `envolvidos`: uma lista de dicionários contendo todas as pessoas citadas na matéria jornalística e alguns dados:
            - `cargo`: o cargo da pessoa
            - `nome`: o nome da pessoa
            - `opinioes`: uma lista de string contendo as opiniões proferidas pelas pessoas

O código abaixo imprime toda a estrutura dos metados:

```python
for sample in phbr_lds:
    id = sample['id']
    transcricao = sample['transcricao'] # long document
    materia = sample['materia']         # Summary
    metadados = sample['metadados']     # Structured summary
    
    print(f"\n########## ID: {id}")
    for envolvido in metadados['envolvidos']:
        cargo = envolvido['cargo']
        nome = envolvido['nome']
        opinioes = envolvido['opinioes']
        
        print(f"\n\tNome: {nome}")
        print(f"\tCargo: {cargo}")
        print(f"\tOpiniões:")
        for opiniao in opinioes:
            print(f"\t\t- {opiniao}")
```
			
## 2. PublicHearingBR_NLI - Natural Language Inference

O arquivo PublicHearingBR_NLI.jsonl 4238 amostras para testes de inferência em linguagem natural. Cada uma dessas amostras contém uma opinião e um conjunto de textos. Além disso, há uma flag indicando se a opinião pode ser inferida a partir desse conjunto de textos.

Considerando que `phbr_nli` é o dataset extraído do jsonl:

- `phbr_nli[0]` é um dict com 2 parâmetros:
    - `id`: um int indicando, no phbr_lds, a que sample os metadados_extraidos se referem. Na prática, é um id apenas de referência, ele não precisa ser usado.
    - `metadados_extraidos` é uma estrutura similar a estrutura metadados do phbr_lds. Porém, há algumas diferenças. Essa estrutura foi gerada pelo experimento de sumarização de transcrição feito no ChatGPT descrito no artigo e possui 3 parâmetros:
        - `assunto`: uma string que representa o assunto principal da transcrição
        - `envolvidos`: uma lista de estrutura similar a do mesmo campo no dataset `phbr_lds`. Ou seja, possui os seguintes dados:
            - `nome`: uma string indicando o nome da pessoa extraído da transcrição pelo experimento
            - `cargo`: o cargo da pessoa extraído da transcrição pelo experimento
            - `opinioes`: uma lista de opiniões da pessoa. Cada elemento dessa lista é um dict (isso difere do campo `opinioes` do dataset `phbr_lds`) com a seguinte estrutura:
                - `opiniao`: a opinião extraída pelo experimento
                - `chunks_proximos`: uma lista contendo quatro chunks. A tarefa é saber se é possível inferir a opinião desses quatro chunks
                - `verificacao_alucinacao`: um dict contendo a verificacao da alucinação. Esse dict contém uma chave `verificacao_manual` que é a anotação manual dessa informação, um boolean indicando se a opinião é alucinação ou não (ou seja, se pode ser inferida a partir dos chunks próximos). Além disso, essa estrutura possui os resultados de testes com os 3 prompts descritos no artigo.

O código abaixo imprime todas as opiniões, chunks próximos e a indicação informando se é uma alucinação ou não:


```python
    for sample in phbr_nli[0:n]:
        id = sample['id']
        metadados_extraidos = sample['metadados_extraidos']
        
        print(f"\n########## ID: {id}")
        for envolvido in metadados_extraidos['envolvidos']:
            nome = envolvido['nome']
            cargo = envolvido['cargo']
            
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
```


```
@misc{fernandes2024publichearingbrbrazilianportuguesedataset,
      title={PublicHearingBR: A Brazilian Portuguese Dataset of Public Hearing Transcripts for Summarization of Long Documents}, 
      author={Leandro Carísio Fernandes and Guilherme Zeferino Rodrigues Dobins and Roberto Lotufo and Jayr Alencar Pereira},
      year={2024},
      eprint={2410.07495},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2410.07495}, 
}
```