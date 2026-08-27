import type { Locale } from "@/i18n/config";

interface MarkdownLocaleCopy {
  canonical: string;
  perMonth: string;
  fullHtml: string;
  links: {
    title: string;
    home: string;
    pricing: string;
    mcp: string;
    selfHosting: string;
    download: string;
    repository: string;
    changelog: string;
    mcpGuide: string;
    terms: string;
    privacy: string;
  };
}

export const MARKDOWN_LOCALE_COPY: Record<Locale, MarkdownLocaleCopy> = {
  en: {
    canonical: "Canonical",
    perMonth: "month",
    fullHtml: "The full text of this page is only published as HTML",
    links: {
      title: "Links",
      home: "Home",
      pricing: "Pricing",
      mcp: "MCP server",
      selfHosting: "Self-hosting guide",
      download: "Downloads",
      repository: "Repository",
      changelog: "Changelog",
      mcpGuide: "MCP integration guide",
      terms: "Terms",
      privacy: "Privacy",
    },
  },
  fr: {
    canonical: "URL canonique",
    perMonth: "mois",
    fullHtml: "Le texte intégral de cette page est publié uniquement en HTML",
    links: {
      title: "Liens",
      home: "Accueil",
      pricing: "Tarifs",
      mcp: "Serveur MCP",
      selfHosting: "Guide d'auto-hébergement",
      download: "Téléchargements",
      repository: "Dépôt",
      changelog: "Nouveautés",
      mcpGuide: "Guide d'intégration MCP",
      terms: "Conditions d'utilisation",
      privacy: "Confidentialité",
    },
  },
  de: {
    canonical: "Kanonische URL",
    perMonth: "Monat",
    fullHtml: "Der vollständige Text dieser Seite ist nur als HTML verfügbar",
    links: {
      title: "Links",
      home: "Startseite",
      pricing: "Preise",
      mcp: "MCP-Server",
      selfHosting: "Anleitung zum Selbst-Hosting",
      download: "Downloads",
      repository: "Repository",
      changelog: "Änderungsprotokoll",
      mcpGuide: "MCP-Integrationsanleitung",
      terms: "Nutzungsbedingungen",
      privacy: "Datenschutz",
    },
  },
  "pt-BR": {
    canonical: "URL canônica",
    perMonth: "mês",
    fullHtml: "O texto completo desta página está disponível apenas em HTML",
    links: {
      title: "Links",
      home: "Início",
      pricing: "Preços",
      mcp: "Servidor MCP",
      selfHosting: "Guia de auto-hospedagem",
      download: "Downloads",
      repository: "Repositório",
      changelog: "Histórico de alterações",
      mcpGuide: "Guia de integração MCP",
      terms: "Termos",
      privacy: "Privacidade",
    },
  },
  it: {
    canonical: "URL canonico",
    perMonth: "mese",
    fullHtml: "Il testo completo di questa pagina è disponibile solo in HTML",
    links: {
      title: "Collegamenti",
      home: "Home",
      pricing: "Prezzi",
      mcp: "Server MCP",
      selfHosting: "Guida all'hosting autonomo",
      download: "Download",
      repository: "Repository",
      changelog: "Registro delle modifiche",
      mcpGuide: "Guida all'integrazione MCP",
      terms: "Termini",
      privacy: "Privacy",
    },
  },
  es: {
    canonical: "URL canónica",
    perMonth: "mes",
    fullHtml: "El texto completo de esta página solo está disponible en HTML",
    links: {
      title: "Enlaces",
      home: "Inicio",
      pricing: "Precios",
      mcp: "Servidor MCP",
      selfHosting: "Guía de autoalojamiento",
      download: "Descargas",
      repository: "Repositorio",
      changelog: "Registro de cambios",
      mcpGuide: "Guía de integración MCP",
      terms: "Términos",
      privacy: "Privacidad",
    },
  },
};
