// `lucide-react` remplacé par un no-op dans le bundle de la projection (MIN-295).
//
// Chaque descripteur de bloc (components/pages/blocks/*.ts) porte l'icône de son
// entrée du menu « / ». C'est une donnée de l'ÉDITEUR : la projection markdown
// monte le même registre, mais en `headless` — elle n'a ni menu, ni rendu, ni
// React. L'import n'en tirait pas moins le paquet entier, soit 971 Ko de tracés
// SVG et le build de développement de React, chargés à froid dans la fonction
// pour n'être jamais lus.
//
// Le proxy rend un composant inerte pour n'importe quel nom : le descripteur
// garde un `icon` défini (personne ne le déréférence ici, mais un `undefined`
// serait une différence de plus entre les deux montages), et un nouvel import
// d'icône dans un bloc ne casse pas ce bundle.
const Icon = () => null;
Icon.displayName = "LucideIconStub";

module.exports = new Proxy(
  { __esModule: true, default: Icon },
  { get: (target, key) => (key in target ? target[key] : Icon) },
);
