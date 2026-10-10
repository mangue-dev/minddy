/** Exact meaningful demo labels; IDs, relationships, values and counts remain unchanged. */
export const projectId = '3bdf5b04-ed54-40cd-b65f-10086fed72c1';
export const databaseId = '7f171445-675b-45f4-835c-c475a4f3c1df';
export const entryId = '4a7fd286-4eb7-4289-92f8-44848d1b79df';
export const importDatabaseId = '0a6f9e42-f3f0-4228-807e-176a6238b2fe';
export const sourceLabels = ['Projet de démonstration documentation','Base de démonstration MIN-664','Import de démonstration MIN-664','Vérifier la navigation mobile','Vérifier que les boutons restent accessibles sur un écran étroit.','Description','Durée','Vérifié','État','Guide de vérification MIN-664','Vérifier les parcours de documentation sur l’instance locale isolée.','Contrôler les boutons au clavier et sur mobile.'];
export const labels = {
 en: ['Documentation demo project','MIN-664 demo database','MIN-664 demo import','Check mobile navigation','Check that buttons remain accessible on a narrow screen.','Description','Duration','Checked','Status', "MIN-664 verification guide", "Verify documentation workflows on the isolated local instance.", "Check controls with the keyboard and on mobile."],
 fr: sourceLabels,
 de: ['Dokumentations-Demoprojekt','MIN-664-Demodatenbank','MIN-664-Demoimport','Mobile Navigation prüfen','Prüfen, ob die Schaltflächen auf einem schmalen Bildschirm erreichbar bleiben.','Beschreibung','Dauer','Geprüft','Status', "MIN-664-Prüfleitfaden", "Dokumentationsabläufe auf der isolierten lokalen Instanz prüfen.", "Die Bedienelemente mit der Tastatur und auf Mobilgeräten prüfen."],
 es: ['Proyecto de demostración de documentación','Base de datos de demostración MIN-664','Importación de demostración MIN-664','Comprobar la navegación móvil','Comprobar que los botones siguen siendo accesibles en una pantalla estrecha.','Descripción','Duración','Verificado','Estado', "Guía de verificación MIN-664", "Verificar los recorridos de documentación en la instancia local aislada.", "Comprobar los controles con el teclado y en dispositivos móviles."],
 it: ['Progetto dimostrativo della documentazione','Database dimostrativo MIN-664','Importazione dimostrativa MIN-664','Verificare la navigazione mobile','Verificare che i pulsanti restino accessibili su uno schermo stretto.','Descrizione','Durata','Verificato','Stato', "Guida di verifica MIN-664", "Verificare i percorsi della documentazione sull’istanza locale isolata.", "Controllare i comandi con la tastiera e sui dispositivi mobili."],
 'pt-BR': ['Projeto de demonstração da documentação','Banco de dados de demonstração MIN-664','Importação de demonstração MIN-664','Verificar a navegação móvel','Verificar se os botões continuam acessíveis em uma tela estreita.','Descrição','Duração','Verificado','Status', "Guia de verificação MIN-664", "Verificar os fluxos da documentação na instância local isolada.", "Verificar os controles com o teclado e em dispositivos móveis."],
};
export function localize(value, locale) {
 if (typeof value === 'string') { const i=sourceLabels.indexOf(value); return i<0?value:labels[locale][i]; }
 if (Array.isArray(value)) return value.map(item=>localize(item,locale));
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,localize(item,locale)]));
 return value;
}
