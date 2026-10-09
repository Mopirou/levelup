-- Les scores de départ passent de l'échelle 8-15 (27 points d'achat) à l'échelle 2-5 (6 points à répartir).
-- Les personnages existants gardent leurs proportions : chaque score devient 2 + points investis × 6 / 27 (3 points au maximum).
-- Sans effet sur les personnages déjà à la nouvelle échelle (aucun score de départ n'y dépasse 5).
update public.characters c
set base_scores = (
  select jsonb_object_agg(
    e.key,
    2 + least(3, round(
      (case e.value::int when 8 then 0 when 9 then 1 when 10 then 2 when 11 then 3 when 12 then 4 when 13 then 5 when 14 then 7 else 9 end) * 6.0 / 27
    ))
  )
  from jsonb_each_text(c.base_scores) e
)
where exists (select 1 from jsonb_each_text(c.base_scores) e where e.value::int > 5);
