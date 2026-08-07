// `server-only` remplacé par un no-op dans le bundle de la microVM (MIN-224).
//
// Le vrai paquet LÈVE quand il est importé hors d'un contexte serveur React, ce
// qui est exactement le cas de la microVM : elle fait tourner du Node nu. Aucun
// module du bundle ne devrait l'importer — le tri a été fait, et le test de
// graphe le garde — mais un import oublié doit se traduire par un module inerte,
// pas par un harness qui refuse de démarrer.
module.exports = {};
