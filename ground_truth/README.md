# ground_truth/ — verdad absoluta del workshop (SÍ se versiona)

Fixtures de evaluación, datos ficticios sin secretos: el checklist, las
reglas y los docs esperados por caso. El agente (LLM) NUNCA los ve:

- Ningún endpoint de `api` los sirve (solo `cases/` es visible).
- `brain` no tiene ninguna tool que los lea (`list_case_docs`/`read_case_doc`
  solo tocan `cases/`).
- Solo `modules/verify.rs::verify_now()` los lee, en el proceso `api`.

Notas:

- Los permisos `700/600` son convención local (`chmod` tras clonar); git no
  los preserva. El aislamiento real es por proceso + API, no por FS.
- Nunca loguear su contenido (solo ids/conteos) ni añadir endpoints que los
  expongan, ni siquiera parciales (el checklist por ítem de la UI :8765 es
  solo para humanos y no tiene tool).
