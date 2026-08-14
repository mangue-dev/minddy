/**
 * Les onglets HORIZONTAUX du produit, resserrés.
 *
 * mangue-ui dessine une barre d'onglets d'ÉCRAN : 40 px de haut en `line`,
 * `px-4` par onglet, et un `flex-1` qui les étire tous à la même largeur — dans
 * une liste `w-full`, deux libellés prennent une demi-colonne chacun. Nos
 * onglets, eux, vivent DANS une colonne, au-dessus d'un contenu qui commence
 * juste en dessous : le panneau d'un ticket, le détail d'une pull request,
 * l'historique d'une page, le composer d'un commentaire. À cette échelle, des
 * onglets étirés se lisent comme des boutons, pas comme des onglets.
 *
 * Les deux classes vont ensemble : chaque onglet à la taille de son libellé, et
 * la rangée à la hauteur d'une ligne.
 */
export const TAB_LIST_DENSE = "h-9 justify-start";
export const TAB_TRIGGER_DENSE = "flex-none px-3";
