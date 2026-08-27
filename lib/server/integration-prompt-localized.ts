import { SSO_ENV_VAR } from "@/lib/feedback/env-lines";
import { INTEGRATION_ENV_VAR } from "@/lib/feedback/integration-contract";
import type {
  IntegrationPromptInput,
  IntegrationPromptWebhook,
} from "./integration-prompt";

type AddedLocale = "de" | "pt-BR" | "it" | "es";

interface PromptCopy {
  boardTitle: string;
  boardGoal: (project: string) => string;
  where: string;
  boardPlacement: string;
  what: string;
  requiredFields: string;
  serverRequest: string;
  boardBasic: (url: string) => string;
  boardSso: (url: string) => string;
  verification: string;
  boardBasicCheck: string;
  boardSsoCheck: string;
  feedbackTitle: string;
  feedbackGoal: (project: string) => string;
  feedbackPlacement: string;
  feedbackRules: string;
  feedbackCheck: (project: string) => string;
  issuesTitle: string;
  issuesGoal: (project: string) => string;
  issuesPlacement: string;
  issuesRules: string;
  issuesCheck: (project: string) => string;
  webhookTitle: string;
  webhookIntro: (url: string, events: string, scope: string) => string;
  webhookRules: (envVar: string) => string;
  webhookCheck: string;
  scopeAll: string;
  scopeIntegration: string;
}

const COPY: Record<AddedLocale, PromptCopy> = {
  de: {
    boardTitle: "minddy-Feedback in diese Anwendung integrieren",
    boardGoal: (project) =>
      `Ziel: Einen Feedback-Zugang zum öffentlichen minddy-Board des Projekts „${project}“ hinzufügen. Dort können Nutzer Beiträge erstellen, abstimmen und Anforderungen präzisieren; Duplikate werden automatisch zusammengeführt.`,
    where: "Platzierung",
    boardPlacement:
      "An der passendsten Stelle für einen Feedback-Link, etwa im Benutzermenü, in der Fußzeile oder auf der Hilfeseite.",
    what: "Umsetzung",
    requiredFields:
      "Füge einen kurzen Pflichttitel und eine optionale Beschreibung hinzu.",
    serverRequest: "Verwende diese Anfrage ausschließlich serverseitig:",
    boardBasic: (url) =>
      `1. Füge dort einen Feedback-Link hinzu.\n2. Öffne möglichst in einem neuen Tab:\n   \`${url}\`\n3. Die Seite übernimmt Identität und E-Mail-Verifizierung; in der Anwendung ist keine weitere Logik nötig.`,
    boardSso: (url) =>
      `1. Füge dort einen Feedback-Link hinzu, der auf einen kleinen Server-Endpunkt zeigt, zum Beispiel \`GET /feedback\`.\n2. Der Endpunkt erstellt für den angemeldeten Nutzer ein neues, einmalig nutzbares **HS256**-JWT und leitet mit Status 302 zu \`${url}?sso=<jwt>\` weiter. Claims: \`sub\` (erforderlich), \`email\` (empfohlen), \`name\` (optional) und \`exp\` (erforderlich, höchstens 10 Minuten in der Zukunft). Token nie cachen.\n3. Lies das Signiergeheimnis ausschließlich serverseitig aus \`${SSO_ENV_VAR}\`; niemals fest eintragen oder an den Client senden. Fehlt es, leite ohne \`sso\` zu \`${url}\` weiter.\n4. Nicht angemeldete Nutzer werden ebenfalls ohne \`sso\` zum Board geleitet und verifizieren sich dort per E-Mail.`,
    verification: "Prüfung",
    boardBasicCheck:
      "Klicke auf den Link: Das Board öffnet sich und ein Beitrag kann nach der E-Mail-Verifizierung erstellt werden.",
    boardSsoCheck:
      "Angemeldet öffnet sich das Board bereits identifiziert; abgemeldet öffnet es sich anonym und fordert vor einer Beteiligung die E-Mail-Verifizierung an.",
    feedbackTitle: "minddy-Feedback per Server-API integrieren",
    feedbackGoal: (project) =>
      `Ziel: Feedback in der Anwendung erfassen und im Namen des Nutzers an das minddy-Projekt „${project}“ senden. minddy führt doppelte Beiträge automatisch zusammen.`,
    feedbackPlacement:
      "Am passendsten Ort, etwa über einen Feedback-Button mit Titel und optionaler Beschreibung oder über ein bestehendes Supportformular.",
    feedbackRules:
      "Sende ausschließlich serverseitig. `user` benötigt `external_id` und/oder `email`; der Server bestätigt die Identität. Eine Antwort mit 201 enthält den erstellten Beitrag. Behandle 401 `invalid_api_key`, 422 Validierungsfehler und 429 `rate_limited` mit `Retry-After`. Abstimmen ist mit demselben `user`-Objekt über `POST /api/v1/feedback/<post_id>/vote` möglich. Lies den Schlüssel ausschließlich serverseitig aus `MINDDY_FEEDBACK_KEY`; niemals fest eintragen oder an den Client senden. Fehlt er, brich beim Start mit einer klaren Fehlermeldung ab.",
    feedbackCheck: (project) =>
      `Sende Testfeedback: Die Antwort ist 201 und der Beitrag erscheint im Projekt „${project}“ im Tab Feedback beim übermittelten Nutzer.`,
    issuesTitle: "Tickets aus dieser Anwendung an minddy senden",
    issuesGoal: (project) =>
      `Ziel: Tickets im minddy-Projekt „${project}“ erstellen. Sie landen absichtlich in der Triage, damit ein Mensch sie vor dem Backlog prüft.`,
    issuesPlacement:
      "An der passendsten Quelle, etwa bei einem unbehandelten Fehler, einer Support-Eskalation oder einem internen Formular.",
    issuesRules:
      "Sende ausschließlich serverseitig. Zulässige Kategorien liefert `GET /api/v1/issues/options`; sende ihre IDs. Status, zuständige Person und übergeordnetes Ticket sind extern nicht einstellbar. Dedupliziere wiederkehrende Quellen vor dem Senden. Behandle 401, 422 und 429; 403 `issue_limit_reached` ist dauerhaft und darf nicht erneut versucht werden. Lies den Schlüssel ausschließlich serverseitig aus `MINDDY_API_KEY`; niemals fest eintragen oder an den Client senden.",
    issuesCheck: (project) =>
      `Löse einen Test aus: Die Antwort ist 201 und das Ticket erscheint im Projekt „${project}“ in der Triage mit dem Integrationssymbol.`,
    webhookTitle: "Änderungen empfangen (Webhook)",
    webhookIntro: (url, events, scope) =>
      `minddy sendet bereits POST-Anfragen an \`${url}\` für ${events} (${scope}). Implementiere nun den Empfänger.`,
    webhookRules: (envVar) =>
      `1. Lies den unveränderten Rohinhalt der Anfrage.\n2. Prüfe \`X-Minddy-Signature: sha256=<hex>\` mit \`hmac_sha256(raw_body, sha256_hex(process.env.${envVar}))\` und einem zeitkonstanten Vergleich. Der HMAC-Schlüssel ist der kleingeschriebene SHA-256-Hash des API-Schlüssels. Bei fehlender oder falscher Signatur: 401 und nichts verarbeiten.\n3. Antworte innerhalb von fünf Sekunden mit 2xx und erledige längere Arbeit danach.\n4. Verarbeite idempotent anhand von \`delivery_id\`; Zustellungen können doppelt oder in anderer Reihenfolge eintreffen.\n5. Das Ereignis enthält Projekt, Integration und Ticket sowie bei Änderungen \`change\` oder \`changes\`.`,
    webhookCheck:
      "Ändere einen Ticketstatus und prüfe POST, gültige Signatur und 2xx. Ändere anschließend ein Byte derselben Anfrage: Sie muss mit 401 abgelehnt werden.",
    scopeAll: "alle Tickets des Projekts",
    scopeIntegration: "nur Tickets, die diese Integration erstellt hat",
  },
  "pt-BR": {
    boardTitle: "Integrar o feedback do minddy a este aplicativo",
    boardGoal: (project) =>
      `Objetivo: adicionar um acesso ao quadro público de feedback do projeto “${project}” no minddy. Nele, as pessoas publicam, votam e detalham necessidades; duplicatas são unificadas automaticamente.`,
    where: "Onde colocar",
    boardPlacement:
      "No local mais natural para um link de Feedback, como o menu do usuário, o rodapé ou a página de ajuda.",
    what: "Implementação",
    requiredFields:
      "Adicione um título curto obrigatório e uma descrição opcional.",
    serverRequest: "Use esta requisição somente no servidor:",
    boardBasic: (url) =>
      `1. Adicione um link de Feedback nesse local.\n2. Abra, de preferência em uma nova aba:\n   \`${url}\`\n3. A página cuida da identidade e da verificação por e-mail; nenhuma outra lógica é necessária no aplicativo.`,
    boardSso: (url) =>
      `1. Adicione um link de Feedback que aponte para um pequeno endpoint do servidor, por exemplo \`GET /feedback\`.\n2. O endpoint cria um JWT **HS256** novo e de uso único para a pessoa conectada e redireciona com status 302 para \`${url}?sso=<jwt>\`. Claims: \`sub\` (obrigatório), \`email\` (recomendado), \`name\` (opcional) e \`exp\` (obrigatório, no máximo 10 minutos no futuro). Nunca armazene o token em cache.\n3. Leia o segredo de assinatura somente no servidor pela variável \`${SSO_ENV_VAR}\`; nunca o grave no código nem o exponha ao cliente. Se estiver ausente, redirecione para \`${url}\` sem \`sso\`.\n4. Pessoas desconectadas também são redirecionadas sem \`sso\` e fazem a verificação por e-mail no quadro.`,
    verification: "Verificação",
    boardBasicCheck:
      "Clique no link: o quadro abre e permite publicar depois da verificação por e-mail.",
    boardSsoCheck:
      "Com sessão aberta, o quadro já reconhece a pessoa; sem sessão, ele abre anonimamente e pede verificação por e-mail antes da participação.",
    feedbackTitle: "Integrar o feedback do minddy pela API do servidor",
    feedbackGoal: (project) =>
      `Objetivo: coletar feedback no aplicativo e enviá-lo em nome da pessoa para o projeto “${project}” no minddy. O minddy unifica feedbacks duplicados automaticamente.`,
    feedbackPlacement:
      "No local mais adequado, como um botão de Feedback com título e descrição opcional ou um formulário de suporte existente.",
    feedbackRules:
      "Envie somente pelo servidor. `user` deve conter `external_id` e/ou `email`; o servidor garante a identidade. A resposta 201 contém o feedback criado. Trate 401 `invalid_api_key`, erros de validação 422 e 429 `rate_limited` com `Retry-After`. É possível votar com o mesmo objeto `user` por `POST /api/v1/feedback/<post_id>/vote`. Leia a chave somente no servidor pela variável `MINDDY_FEEDBACK_KEY`; nunca a grave no código nem a exponha ao cliente. Se estiver ausente, interrompa a inicialização com um erro claro.",
    feedbackCheck: (project) =>
      `Envie um feedback de teste: a resposta é 201 e ele aparece na aba Feedback do projeto “${project}”, atribuído à pessoa informada.`,
    issuesTitle: "Enviar tarefas deste aplicativo para o minddy",
    issuesGoal: (project) =>
      `Objetivo: criar tarefas no projeto “${project}” do minddy. Elas chegam intencionalmente à triagem para revisão humana antes do backlog.`,
    issuesPlacement:
      "Na origem mais adequada, como um erro não tratado, um encaminhamento do suporte ou um formulário interno.",
    issuesRules:
      "Envie somente pelo servidor. Consulte as categorias aceitas em `GET /api/v1/issues/options` e envie seus IDs. Status, responsável e tarefa pai não podem ser definidos externamente. Elimine duplicatas de fontes recorrentes antes do envio. Trate 401, 422 e 429; 403 `issue_limit_reached` é definitivo e não deve ser repetido. Leia a chave somente no servidor pela variável `MINDDY_API_KEY`; nunca a grave no código nem a exponha ao cliente.",
    issuesCheck: (project) =>
      `Dispare um teste: a resposta é 201 e a tarefa aparece na triagem do projeto “${project}” com o indicador da integração.`,
    webhookTitle: "Receber alterações (webhook)",
    webhookIntro: (url, events, scope) =>
      `O minddy já envia requisições POST para \`${url}\` nos eventos ${events} (${scope}). Implemente agora o receptor.`,
    webhookRules: (envVar) =>
      `1. Leia o corpo bruto e inalterado da requisição.\n2. Valide \`X-Minddy-Signature: sha256=<hex>\` com \`hmac_sha256(raw_body, sha256_hex(process.env.${envVar}))\` e comparação em tempo constante. A chave HMAC é o hash SHA-256 em hexadecimal minúsculo da chave da API. Assinatura ausente ou incorreta: responda 401 e não processe nada.\n3. Responda 2xx em até cinco segundos e execute trabalhos demorados depois.\n4. Processe de forma idempotente por \`delivery_id\`; entregas podem se repetir ou chegar fora de ordem.\n5. O evento contém projeto, integração e tarefa, além de \`change\` ou \`changes\` nas alterações.`,
    webhookCheck:
      "Mude o status de uma tarefa e confirme POST, assinatura válida e 2xx. Depois altere um byte da mesma requisição: ela deve ser recusada com 401.",
    scopeAll: "todas as tarefas do projeto",
    scopeIntegration: "somente as tarefas criadas por esta integração",
  },
  it: {
    boardTitle: "Integrare i feedback di minddy in questa applicazione",
    boardGoal: (project) =>
      `Obiettivo: aggiungere un accesso alla bacheca pubblica dei feedback del progetto “${project}” in minddy. Qui le persone pubblicano, votano e precisano le esigenze; i duplicati vengono uniti automaticamente.`,
    where: "Dove inserirlo",
    boardPlacement:
      "Nel punto più naturale per un link Feedback, per esempio nel menu utente, nel piè di pagina o nella pagina di aiuto.",
    what: "Implementazione",
    requiredFields:
      "Aggiungi un titolo breve obbligatorio e una descrizione facoltativa.",
    serverRequest: "Usa questa richiesta soltanto sul server:",
    boardBasic: (url) =>
      `1. Aggiungi un link Feedback in quel punto.\n2. Apri, preferibilmente in una nuova scheda:\n   \`${url}\`\n3. La pagina gestisce identità e verifica via email; nell'applicazione non serve altra logica.`,
    boardSso: (url) =>
      `1. Aggiungi un link Feedback diretto a un piccolo endpoint server, per esempio \`GET /feedback\`.\n2. L'endpoint crea per la persona autenticata un JWT **HS256** nuovo e monouso, poi reindirizza con stato 302 a \`${url}?sso=<jwt>\`. Claim: \`sub\` (obbligatorio), \`email\` (consigliato), \`name\` (facoltativo) ed \`exp\` (obbligatorio, non oltre 10 minuti nel futuro). Non memorizzare mai il token nella cache.\n3. Leggi il segreto di firma soltanto sul server dalla variabile \`${SSO_ENV_VAR}\`; non inserirlo nel codice e non esporlo al client. Se manca, reindirizza a \`${url}\` senza \`sso\`.\n4. Le persone non autenticate vengono reindirizzate senza \`sso\` e si verificano via email nella bacheca.`,
    verification: "Verifica",
    boardBasicCheck:
      "Fai clic sul link: la bacheca si apre e consente di pubblicare dopo la verifica via email.",
    boardSsoCheck:
      "Con una sessione attiva, la bacheca riconosce già la persona; senza sessione, si apre in forma anonima e richiede la verifica via email prima della partecipazione.",
    feedbackTitle: "Integrare i feedback di minddy tramite API server",
    feedbackGoal: (project) =>
      `Obiettivo: raccogliere feedback nell'applicazione e inviarli per conto della persona al progetto “${project}” in minddy. minddy unisce automaticamente i feedback duplicati.`,
    feedbackPlacement:
      "Nel punto più adatto, per esempio un pulsante Feedback con titolo e descrizione facoltativa o un modulo di assistenza esistente.",
    feedbackRules:
      "Invia soltanto dal server. `user` deve contenere `external_id` e/o `email`; il server garantisce l'identità. La risposta 201 contiene il feedback creato. Gestisci 401 `invalid_api_key`, gli errori di convalida 422 e 429 `rate_limited` con `Retry-After`. È possibile votare con lo stesso oggetto `user` tramite `POST /api/v1/feedback/<post_id>/vote`. Leggi la chiave soltanto sul server dalla variabile `MINDDY_FEEDBACK_KEY`; non inserirla nel codice e non esporla al client. Se manca, interrompi l'avvio con un errore chiaro.",
    feedbackCheck: (project) =>
      `Invia un feedback di prova: la risposta è 201 e compare nella scheda Feedback del progetto “${project}”, attribuito alla persona indicata.`,
    issuesTitle: "Inviare ticket a minddy da questa applicazione",
    issuesGoal: (project) =>
      `Obiettivo: creare ticket nel progetto “${project}” di minddy. Arrivano intenzionalmente nel triage affinché una persona li controlli prima del backlog.`,
    issuesPlacement:
      "Nella fonte più adatta, per esempio un errore non gestito, un'escalation dell'assistenza o un modulo interno.",
    issuesRules:
      "Invia soltanto dal server. Leggi le categorie accettate da `GET /api/v1/issues/options` e invia i relativi ID. Stato, assegnatario e ticket padre non possono essere impostati dall'esterno. Elimina i duplicati delle fonti ricorrenti prima dell'invio. Gestisci 401, 422 e 429; 403 `issue_limit_reached` è definitivo e non va ritentato. Leggi la chiave soltanto sul server dalla variabile `MINDDY_API_KEY`; non inserirla nel codice e non esporla al client.",
    issuesCheck: (project) =>
      `Avvia una prova: la risposta è 201 e il ticket compare nel triage del progetto “${project}” con l'indicatore dell'integrazione.`,
    webhookTitle: "Ricevere modifiche (webhook)",
    webhookIntro: (url, events, scope) =>
      `minddy invia già richieste POST a \`${url}\` per gli eventi ${events} (${scope}). Implementa ora il destinatario.`,
    webhookRules: (envVar) =>
      `1. Leggi il corpo grezzo e inalterato della richiesta.\n2. Verifica \`X-Minddy-Signature: sha256=<hex>\` con \`hmac_sha256(raw_body, sha256_hex(process.env.${envVar}))\` e un confronto a tempo costante. La chiave HMAC è l'hash SHA-256 esadecimale minuscolo della chiave API. Se la firma manca o è errata, rispondi 401 e non elaborare nulla.\n3. Rispondi 2xx entro cinque secondi ed esegui dopo le operazioni più lunghe.\n4. Elabora in modo idempotente tramite \`delivery_id\`; le consegne possono ripetersi o arrivare fuori ordine.\n5. L'evento contiene progetto, integrazione e ticket, oltre a \`change\` o \`changes\` nelle modifiche.`,
    webhookCheck:
      "Cambia lo stato di un ticket e verifica POST, firma valida e 2xx. Poi modifica un byte della stessa richiesta: deve essere rifiutata con 401.",
    scopeAll: "tutti i ticket del progetto",
    scopeIntegration: "solo i ticket creati da questa integrazione",
  },
  es: {
    boardTitle: "Integrar los comentarios de minddy en esta aplicación",
    boardGoal: (project) =>
      `Objetivo: añadir un acceso al tablero público de comentarios del proyecto «${project}» en minddy. Allí las personas publican, votan y detallan necesidades; los duplicados se combinan automáticamente.`,
    where: "Dónde colocarlo",
    boardPlacement:
      "En el lugar más natural para un enlace de Comentarios, como el menú de usuario, el pie de página o la página de ayuda.",
    what: "Implementación",
    requiredFields:
      "Añade un título breve obligatorio y una descripción opcional.",
    serverRequest: "Usa esta solicitud solo en el servidor:",
    boardBasic: (url) =>
      `1. Añade un enlace de Comentarios en ese lugar.\n2. Ábrelo, preferiblemente en una pestaña nueva:\n   \`${url}\`\n3. La página gestiona la identidad y la verificación por correo; la aplicación no necesita más lógica.`,
    boardSso: (url) =>
      `1. Añade un enlace de Comentarios que apunte a un pequeño endpoint del servidor, por ejemplo \`GET /feedback\`.\n2. El endpoint crea para la persona autenticada un JWT **HS256** nuevo y de un solo uso, y redirige con estado 302 a \`${url}?sso=<jwt>\`. Claims: \`sub\` (obligatorio), \`email\` (recomendado), \`name\` (opcional) y \`exp\` (obligatorio, como máximo 10 minutos en el futuro). Nunca almacenes el token en caché.\n3. Lee el secreto de firma solo en el servidor desde \`${SSO_ENV_VAR}\`; nunca lo incluyas en el código ni lo expongas al cliente. Si falta, redirige a \`${url}\` sin \`sso\`.\n4. Las personas sin sesión también se redirigen sin \`sso\` y se verifican por correo en el tablero.`,
    verification: "Verificación",
    boardBasicCheck:
      "Haz clic en el enlace: el tablero se abre y permite publicar después de la verificación por correo.",
    boardSsoCheck:
      "Con una sesión activa, el tablero ya reconoce a la persona; sin sesión, se abre de forma anónima y solicita verificación por correo antes de participar.",
    feedbackTitle:
      "Integrar los comentarios de minddy mediante la API del servidor",
    feedbackGoal: (project) =>
      `Objetivo: recoger comentarios en la aplicación y enviarlos en nombre de la persona al proyecto «${project}» en minddy. minddy combina automáticamente los comentarios duplicados.`,
    feedbackPlacement:
      "En el lugar más adecuado, como un botón de Comentarios con título y descripción opcional o un formulario de soporte existente.",
    feedbackRules:
      "Envía solo desde el servidor. `user` debe contener `external_id` y/o `email`; el servidor garantiza la identidad. La respuesta 201 contiene el comentario creado. Gestiona 401 `invalid_api_key`, los errores de validación 422 y 429 `rate_limited` con `Retry-After`. Se puede votar con el mismo objeto `user` mediante `POST /api/v1/feedback/<post_id>/vote`. Lee la clave solo en el servidor desde `MINDDY_FEEDBACK_KEY`; nunca la incluyas en el código ni la expongas al cliente. Si falta, detén el inicio con un error claro.",
    feedbackCheck: (project) =>
      `Envía un comentario de prueba: la respuesta es 201 y aparece en la pestaña Comentarios del proyecto «${project}», atribuido a la persona indicada.`,
    issuesTitle: "Enviar incidencias a minddy desde esta aplicación",
    issuesGoal: (project) =>
      `Objetivo: crear incidencias en el proyecto «${project}» de minddy. Llegan intencionadamente a triaje para que una persona las revise antes del backlog.`,
    issuesPlacement:
      "En la fuente más adecuada, como un error no controlado, una escalada de soporte o un formulario interno.",
    issuesRules:
      "Envía solo desde el servidor. Consulta las categorías admitidas en `GET /api/v1/issues/options` y envía sus ID. El estado, la persona asignada y la incidencia principal no pueden definirse desde fuera. Elimina duplicados de fuentes recurrentes antes de enviar. Gestiona 401, 422 y 429; 403 `issue_limit_reached` es definitivo y no debe reintentarse. Lee la clave solo en el servidor desde `MINDDY_API_KEY`; nunca la incluyas en el código ni la expongas al cliente.",
    issuesCheck: (project) =>
      `Lanza una prueba: la respuesta es 201 y la incidencia aparece en el triaje del proyecto «${project}» con el indicador de integración.`,
    webhookTitle: "Recibir cambios (webhook)",
    webhookIntro: (url, events, scope) =>
      `minddy ya envía solicitudes POST a \`${url}\` para los eventos ${events} (${scope}). Implementa ahora el receptor.`,
    webhookRules: (envVar) =>
      `1. Lee el cuerpo bruto y sin modificar de la solicitud.\n2. Valida \`X-Minddy-Signature: sha256=<hex>\` con \`hmac_sha256(raw_body, sha256_hex(process.env.${envVar}))\` y una comparación de tiempo constante. La clave HMAC es el hash SHA-256 hexadecimal en minúsculas de la clave de API. Si la firma falta o es incorrecta, responde 401 y no proceses nada.\n3. Responde 2xx en menos de cinco segundos y realiza después el trabajo más largo.\n4. Procesa de forma idempotente mediante \`delivery_id\`; las entregas pueden repetirse o llegar desordenadas.\n5. El evento contiene proyecto, integración e incidencia, además de \`change\` o \`changes\` en las modificaciones.`,
    webhookCheck:
      "Cambia el estado de una incidencia y comprueba POST, firma válida y 2xx. Después modifica un byte de la misma solicitud: debe rechazarse con 401.",
    scopeAll: "todas las incidencias del proyecto",
    scopeIntegration: "solo las incidencias creadas por esta integración",
  },
};

function boardPrompt(
  locale: AddedLocale,
  input: IntegrationPromptInput,
  placement: string,
): string {
  const copy = COPY[locale];
  const instructions = input.sso
    ? copy.boardSso(input.boardUrl ?? "")
    : copy.boardBasic(input.boardUrl ?? "");
  const check = input.sso ? copy.boardSsoCheck : copy.boardBasicCheck;
  return `# ${copy.boardTitle}\n\n${copy.boardGoal(input.projectName)}\n\n## ${copy.where}\n\n${placement || copy.boardPlacement}\n\n## ${copy.what}\n\n${instructions}\n\n## ${copy.verification}\n\n- ${check}`;
}

function feedbackPrompt(
  locale: AddedLocale,
  input: IntegrationPromptInput,
  placement: string,
): string {
  const copy = COPY[locale];
  return `# ${copy.feedbackTitle}\n\n${copy.feedbackGoal(input.projectName)}\n\n## ${copy.where}\n\n${placement || copy.feedbackPlacement}\n\n## ${copy.what}\n\n1. ${copy.requiredFields}\n2. ${copy.serverRequest}\n\n${feedbackRequest(input.origin)}\n\n3. ${copy.feedbackRules}\n\n## ${copy.verification}\n\n- ${copy.feedbackCheck(input.projectName)}`;
}

function issuesPrompt(
  locale: AddedLocale,
  input: IntegrationPromptInput,
  placement: string,
): string {
  const copy = COPY[locale];
  return `# ${copy.issuesTitle}\n\n${copy.issuesGoal(input.projectName)}\n\n## ${copy.where}\n\n${placement || copy.issuesPlacement}\n\n## ${copy.what}\n\n1. ${copy.requiredFields}\n2. ${copy.serverRequest}\n\n${issuesRequest(input.origin)}\n\n3. ${copy.issuesRules}\n\n## ${copy.verification}\n\n- ${copy.issuesCheck(input.projectName)}`;
}

function webhookSection(
  locale: AddedLocale,
  webhook: IntegrationPromptWebhook,
  envVar: string,
): string {
  const copy = COPY[locale];
  const events = webhook.events.map((event) => `\`${event}\``).join(", ");
  const scope = webhook.scope === "all" ? copy.scopeAll : copy.scopeIntegration;
  return `## ${copy.webhookTitle}\n\n${copy.webhookIntro(webhook.url, events, scope)}\n\n${copy.webhookRules(envVar)}\n\n## ${copy.verification}\n\n- ${copy.webhookCheck}`;
}

function feedbackRequest(origin: string): string {
  return `\`\`\`http\nPOST ${origin}/api/v1/feedback\nAuthorization: Bearer $${INTEGRATION_ENV_VAR.feedback}\nContent-Type: application/json\n\n{\n  "title": "<short title>",\n  "body": "<optional description>",\n  "user": {\n    "external_id": "<stable user id>",\n    "email": "<email>",\n    "name": "<optional name>"\n  }\n}\n\`\`\``;
}

function issuesRequest(origin: string): string {
  return `\`\`\`http\nPOST ${origin}/api/v1/issues\nAuthorization: Bearer $${INTEGRATION_ENV_VAR.issues}\nContent-Type: application/json\n\n{\n  "title": "<short title>",\n  "description": "<optional markdown description>",\n  "priority": "none | low | medium | high | urgent",
  "effort": "xs | s | m | l | xl",
  "categories": ["<optional category id>"]\n}\n\`\`\``;
}

export const boardPromptDe = (
  input: IntegrationPromptInput,
  placement: string,
) => boardPrompt("de", input, placement);
export const boardPromptPtBr = (
  input: IntegrationPromptInput,
  placement: string,
) => boardPrompt("pt-BR", input, placement);
export const boardPromptIt = (
  input: IntegrationPromptInput,
  placement: string,
) => boardPrompt("it", input, placement);
export const boardPromptEs = (
  input: IntegrationPromptInput,
  placement: string,
) => boardPrompt("es", input, placement);
export const apiPromptDe = (input: IntegrationPromptInput, placement: string) =>
  feedbackPrompt("de", input, placement);
export const apiPromptPtBr = (
  input: IntegrationPromptInput,
  placement: string,
) => feedbackPrompt("pt-BR", input, placement);
export const apiPromptIt = (input: IntegrationPromptInput, placement: string) =>
  feedbackPrompt("it", input, placement);
export const apiPromptEs = (input: IntegrationPromptInput, placement: string) =>
  feedbackPrompt("es", input, placement);
export const issuesPromptDe = (
  input: IntegrationPromptInput,
  placement: string,
) => issuesPrompt("de", input, placement);
export const issuesPromptPtBr = (
  input: IntegrationPromptInput,
  placement: string,
) => issuesPrompt("pt-BR", input, placement);
export const issuesPromptIt = (
  input: IntegrationPromptInput,
  placement: string,
) => issuesPrompt("it", input, placement);
export const issuesPromptEs = (
  input: IntegrationPromptInput,
  placement: string,
) => issuesPrompt("es", input, placement);
export const webhookSectionDe = (
  webhook: IntegrationPromptWebhook,
  envVar: string,
) => webhookSection("de", webhook, envVar);
export const webhookSectionPtBr = (
  webhook: IntegrationPromptWebhook,
  envVar: string,
) => webhookSection("pt-BR", webhook, envVar);
export const webhookSectionIt = (
  webhook: IntegrationPromptWebhook,
  envVar: string,
) => webhookSection("it", webhook, envVar);
export const webhookSectionEs = (
  webhook: IntegrationPromptWebhook,
  envVar: string,
) => webhookSection("es", webhook, envVar);
