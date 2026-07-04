---
description: Redesign UI components from Figma exports using the AutoKap design token system
arguments: []
---

# Figma → Production UI Redesign

Tu me fournis du code React exporté depuis Figma (positionnement absolu, SF Pro, valeurs hardcodées). Je le traduis en composants production avec flexbox/Tailwind et les design tokens AutoKap.

## Workflow

1. **Tu colles le code Figma** du composant à redesigner
2. **Je lis le composant actuel** dans le codebase pour comprendre la logique existante (state, hooks, events)
3. **Je réécris le composant** en combinant :
   - La structure visuelle du Figma (layout, hiérarchie, espacement)
   - La logique du composant existant (hooks, events, conditions)
   - Les design tokens AutoKap (jamais de valeurs hardcodées)
4. **Tu vérifies visuellement** et on itère si besoin

## Règles de traduction

### Positionnement
- Figma utilise `position: absolute` partout → convertir en `flex`, `gap`, `justify-between`, etc.
- Respecter la hiérarchie visuelle du Figma mais utiliser du layout CSS moderne

### Typographie
- Figma exporte en SF Pro → on utilise Geist (hérité de `font-sans`)
- Mapper les tailles Figma aux tokens les plus proches :
  - 11px → `text-ui-xs`
  - 12px → `text-ui-sm`
  - 13px → `text-ui`
  - 14px → `text-ui-md`
  - 16px → `text-ui-lg`

### Couleurs
- Mapper les couleurs Figma aux tokens `ak-*` :
  - Backgrounds blancs → `bg-ak-surface`
  - Bordures → `border-ak-border` / `border-ak-border-subtle` / `border-ak-border-strong`
  - Hover states → `bg-ak-hover` / `hover:bg-ak-hover/50`
  - Texte secondaire/gris → `text-ak-secondary`
  - Accent cyan → `text-ak-accent` / `bg-ak-accent/10`

### Dimensions
- Utiliser les tokens de spacing :
  - Header height → `h-header`
  - Sidebar width → `w-sidebar` / `w-sidebar-sm`
  - Nav items → `h-nav` (+ `w-nav` si collapsed)
  - Buttons → `h-btn`
  - Icons → `h-icon w-icon` / `h-icon-sm w-icon-sm`
  - Favicons → `h-favicon w-favicon`

### Border radius
- `rounded-nav` (10px), `rounded-btn` (8px), `rounded-favicon` (4px), `rounded-user` (12px)

## Référence design tokens

Fichier source : `web/app/globals.css` (section `@theme inline`)
Documentation : `web/docs/design-tokens.md`

## Pièges connus

- **`size-*` ne marche PAS** avec les tokens custom `--spacing-*` en Tailwind v4. Toujours utiliser `h-* w-*` séparément
- **Sidebar/Header** sont au-dessus de `ProjectProvider` → extraire le project ID depuis le pathname, pas depuis un contexte React
- **Favicon autoheal** : `getProjectIconUrl(project)` utilise l'API Google Favicon quand `icon_url` est null

## Composants déjà redesignés

- `web/components/app-sidebar.tsx` — Sidebar avec collapse/expand, home state + project state
- `web/components/app-header.tsx` — Header avec breadcrumb, project switcher dropdown

## Composants restants

Passer composant par composant en suivant le même workflow. Le user fournira le code Figma pour chaque composant.
