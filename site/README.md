# Site da Rezolveaê

Site estático de apresentação: página inicial, Termos de uso, Política de privacidade e Excluir conta
(o Google Play pede esse endereço no cadastro do app).

## Gerar

```bash
node site/build.mjs
```

O resultado vai para `site/public/`, que é o que se publica. Não edite `public/` à mão: rode o build de novo.

## De onde vêm os textos

O build lê o app (`resolve-app`), então o site sempre diz o mesmo que o app:

| No site | Fonte no app |
| --- | --- |
| Serviços | `supabase/seed.sql` |
| Como funciona, Dúvidas | `src/content/help.ts` |
| Termos e Privacidade | `src/content/legal.ts` e `src/content/company.ts` |
| Ícones | `src/components/iconPaths.ts` |

Mudou um desses arquivos? Rode o build. Se uma pergunta usada em Dúvidas mudar de texto em `help.ts`,
o build para com erro dizendo qual (a lista fica em `build.mjs`).

Campos entre colchetes (`[RAZÃO SOCIAL]`, `[CNPJ]`, `[DATA]`…) aparecem destacados em amarelo nas páginas
legais até serem preenchidos em `company.ts` e `legal.ts`. Com a razão social preenchida, ela e o CNPJ
aparecem no rodapé.

Textos, layout e estilo do site ficam em `build.mjs` e `style.css`; fontes e logos em `assets/`.
