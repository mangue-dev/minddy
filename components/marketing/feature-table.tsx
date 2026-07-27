import { Check, Minus } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";

/**
 * Le tableau comparatif du site public, sans son contenu (MIN-93).
 *
 * Extrait de `pricing-comparison.tsx`, qui en était le seul appelant : les
 * pages `/alternatives/<outil>` comparent la même chose sous une autre forme —
 * des lignes groupées, des colonnes, et des cellules qui valent oui, non ou une
 * valeur. Un second tableau recopié aurait divergé sur la première correction
 * de mise en page, et la colonne de gauche collante est précisément le genre de
 * détail qu'on ne recopie pas juste.
 *
 * Purement présentationnel : AUCUNE traduction ici, aucun accès aux plans. Les
 * libellés arrivent déjà traduits, les cellules déjà calculées. C'est ce qui
 * permet à la page tarifs de continuer à dériver ses valeurs de
 * `BILLING_PLANS` pendant que les comparatifs dérivent les leurs de
 * `lib/comparisons.ts`.
 */

/** `true` = inclus, `false` = absent, une chaîne = la valeur de la cellule. */
export type FeatureCell = string | boolean;

export interface FeatureColumn {
  key: string;
  label: string;
  /** Colonne mise en avant (le plan conseillé, minddy dans un comparatif). */
  highlighted?: boolean;
}

export interface FeatureRow {
  key: string;
  label: string;
  /** Détail replié derrière un « i », quand la ligne en demande un. */
  hint?: React.ReactNode;
  /** Une cellule par colonne, dans le même ordre. */
  cells: ReadonlyArray<FeatureCell>;
}

export interface FeatureGroup {
  key: string;
  label: string;
  rows: ReadonlyArray<FeatureRow>;
}

export function FeatureTable({
  caption,
  columns,
  groups,
  includedLabel,
  notIncludedLabel,
}: {
  /** Titre lu par les lecteurs d'écran (`<caption class="sr-only">`). */
  caption: string;
  columns: ReadonlyArray<FeatureColumn>;
  groups: ReadonlyArray<FeatureGroup>;
  /** Libellés des icônes oui/non, pour qui ne voit pas les icônes. */
  includedLabel: string;
  notIncludedLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      {/* `border-separate` et non `border-collapse` : la colonne de gauche est
          collée à gauche pour survivre au défilement horizontal du mobile, et
          une cellule `sticky` sous `border-collapse` perd le filet de sa ligne
          (le trait appartient alors au tableau, pas à la cellule). Chaque
          cellule porte donc son propre `border-t`. */}
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>

        {groups.map((group, groupIndex) => (
          <tbody key={group.key}>
            {/* Trente lignes plus loin, « la colonne du milieu, c'était Go ? »
                est la seule question qui compte. Un en-tête `sticky` y
                répondrait, mais la navbar se rétracte au défilement : il
                flotterait au-dessus d'une bande vide. Chaque groupe rappelle
                donc les colonnes lui-même — et ça marche aussi sur le tableau
                qui défile latéralement, où rien ne peut coller. */}
            <tr>
              <th
                scope="col"
                className={cn(
                  "sticky left-0 z-10 w-[38%] bg-background pr-6 pb-3 text-left text-sm font-semibold text-foreground",
                  groupIndex > 0 && "pt-12",
                )}
              >
                {group.label}
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "pb-3 text-center text-sm font-semibold",
                    groupIndex > 0 && "pt-12",
                    column.highlighted ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>

            {group.rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-border bg-background py-3.5 pr-6 text-left font-normal"
                >
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    {row.label}
                    {row.hint}
                  </span>
                </th>
                {row.cells.map((cell, index) => (
                  // `relative` : les libellés sr-only sont en position absolue.
                  // Sans bloc conteneur local, ils se positionnent par rapport
                  // au document et échappent au défilement horizontal du
                  // tableau — la page entière déborderait sur mobile.
                  <td
                    key={columns[index]?.key ?? index}
                    className="relative border-t border-border py-3.5 text-center"
                  >
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <>
                          <Check
                            className="mx-auto h-4 w-4 text-primary"
                            strokeWidth={3}
                            aria-hidden
                          />
                          <span className="sr-only">{includedLabel}</span>
                        </>
                      ) : (
                        <>
                          <Minus
                            className="mx-auto h-4 w-4 text-muted-foreground/50"
                            aria-hidden
                          />
                          <span className="sr-only">{notIncludedLabel}</span>
                        </>
                      )
                    ) : (
                      <span className="text-foreground/90">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
