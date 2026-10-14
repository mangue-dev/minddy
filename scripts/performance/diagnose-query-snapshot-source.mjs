import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ts from "typescript-api";
import vm from "node:vm";

export const digest = (value) => createHash("sha256").update(value).digest("hex");

/** Match the published selection's complete ordinary list and unresolved subset. */
export function publishedFeedbackProof(query, ordinaryIds, unresolvedIds, context) {
  const posts = query?.state?.data?.posts;
  const actual = Array.isArray(posts) ? posts.map((post) => post?.id) : [];
  const valid = (ids) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
  const fingerprint = (ids) => digest(JSON.stringify([...ids].sort()));
  const actualValid = valid(actual), ordinaryValid = valid(ordinaryIds), unresolvedValid = valid(unresolvedIds);
  const actualSet = new Set(actual);
  const publishedSelectionPresent = typeof context?.postId === "string" && context.postId.length > 0;
  const scopeMatchesPublishedSelection = publishedSelectionPresent && query?.queryKey?.length === 2 &&
    query.queryKey[0] === "feedback" && query.queryKey[1] === context.projectId && actualSet.has(context.postId);
  const ordinaryResponseIdsMatch = actualValid && ordinaryValid && fingerprint(actual) === fingerprint(ordinaryIds);
  const unresolvedIdsIncluded = actualValid && unresolvedValid && unresolvedIds.every((id) => actualSet.has(id));
  return { accepted: scopeMatchesPublishedSelection && ordinaryResponseIdsMatch && unresolvedIdsIncluded,
    scope: "published-post-unfiltered", scopeMatchesPublishedSelection, publishedSelectionPresent,
    rows: actual.length, unresolvedRows: Array.isArray(unresolvedIds) ? unresolvedIds.length : 0,
    ordinaryResponseIdsMatch, unresolvedIdsIncluded,
    ...(actualValid ? { rowIdsSha256: fingerprint(actual) } : {}),
    ...(unresolvedValid ? { unresolvedSourceIdsSha256: fingerprint(unresolvedIds) } : {}),
    filteredUnresolvedQueryRequiredByPublishedScope: false };
}

/** Extract the actual compiled persistence closure, without approximating its policy. */
export function persistenceProbeSource(source, filename) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let property;
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, (child) => walk(child, visit)); };
  walk(parsed, (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === "persistClient" &&
        ts.isArrowFunction(node.initializer) && node.initializer.body.getText(parsed).includes("JSON.stringify")) property = node;
  });
  if (!property) return null;
  const arrow = property.initializer;
  let budget;
  walk(parsed, (node) => {
    if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.parameters[1]?.initializer?.getText(parsed) === "2097152") budget = node;
  });
  assert.ok(budget, "The actual compiled budget preflight must be recognizable");
  const declarations = budget.body.statements[0].declarationList.declarations;
  const counters = [...declarations].filter((node) => node.initializer?.getText(parsed) === "0").map((node) => node.name.getText(parsed));
  assert.equal(counters.length, 2, "The compiled preflight must expose its byte and value counters");
  const terminal = budget.body.statements.at(-1);
  assert.ok(ts.isTryStatement(terminal));
  const returned = terminal.tryBlock.statements[0];
  assert.ok(ts.isReturnStatement(returned));
  const actual = budget.getText(parsed);
  const prefix = source.slice(budget.getStart(parsed), terminal.getStart(parsed));
  const diagnostic = `${prefix}try{const fits=${returned.expression.getText(parsed)};return{fits,estimatedBytes:${counters[0]},visitedValues:${counters[1]}}}catch{return{fits:false,estimatedBytes:${counters[0]},visitedValues:${counters[1]},exception:true}}}`;
  // This second traversal measures metadata only. It retains the production
  // algorithm and depth/prototype checks, with a hard two-million-value ceiling.
  const extended = diagnostic.replaceAll(/\b1e5\b|\b100000\b/g, "2000000");
  assert.notEqual(extended, diagnostic);
  const location = parsed.getLineAndCharacterOfPosition(arrow.body.getStart(parsed) + 1);
  let predicateName;
  walk(parsed, (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === "shouldDehydrateQuery" && ts.isIdentifier(node.initializer)) predicateName = node.initializer.text;
  });
  let predicate;
  walk(parsed, (node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === predicateName) predicate = node.getText(parsed); });
  assert.ok(predicate?.includes("success"), "Locate the private predicate passed by the actual provider");
  let restore;
  walk(parsed, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "invalidateQueries") return;
    const options = node.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options)) return;
    const predicate = options.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(parsed) === "predicate");
    const type = options.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(parsed) === "refetchType");
    if (!predicate || !type || type.initializer.getText(parsed) !== '"active"' || !ts.isArrowFunction(predicate.initializer)) return;
    const call = predicate.initializer.body;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.arguments.length !== 2) return;
    let validation;
    walk(parsed, (candidate) => {
      if (ts.isFunctionDeclaration(candidate) && candidate.name?.text === call.expression.text) validation = candidate.getText(parsed);
    });
    if (!validation?.includes(".state.dataUpdatedAt") || !validation.includes(".queryKey")) return;
    const location = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    restore = { client: node.expression.expression.getText(parsed), predicate: predicate.initializer.getText(parsed),
      lineNumber: location.line, columnNumber: location.character };
  });
  return { filename, sourceHash: digest(source), parameter: arrow.parameters[0].name.getText(parsed),
    lineNumber: location.line, columnNumber: location.character, budgetSource: actual, diagnosticSource: diagnostic,
    extendedSource: extended, budgetSourceHash: digest(actual), predicateSourceHash: digest(predicate), restore };
}

/** Observe the provider's actual pre-mount predicate at its invalidation call. */
export function restoreMetadataExpression(probe, projects) {
  assert.ok(probe.restore, "Locate the actual restored-query invalidation call");
  return `(()=>{const predicate=(${probe.restore.predicate});const projects=${JSON.stringify(projects)};
    const queries=${probe.restore.client}.getQueryCache().getAll();
    return{boundary:"Immediately before ordinary restored-before-mount invalidation",refetchType:"active",eligible:queries.filter(predicate).map(query=>({
      prefix:typeof query.queryKey[0]==="string"&&/^[a-z-]{1,50}$/.test(query.queryKey[0])?query.queryKey[0]:"other",
      scope:projects.includes(query.queryKey[1])?"synthetic-project-"+(projects.indexOf(query.queryKey[1])+1):"other",
      rows:Array.isArray(query.state.data)?query.state.data.length:null,
      collections:Object.fromEntries(Object.entries(query.state.data||{}).filter(([,item])=>Array.isArray(item)).map(([name,items])=>[/^[a-zA-Z-]{1,50}$/.test(name)?name:"other",items.length])),
      active:query.isActive(),invalidatedBeforeCall:query.state.isInvalidated
    }))};})()`;
}

/** Inspect the actual compact seal/open payload in a separate plain-object realm. */
export function snapshotWireMetadata(probe, wire, projects) {
  const context = vm.createContext({ wire, TextEncoder, localStorage: { getItem: () => null } });
  vm.runInContext(`var ${probe.parameter}=JSON.parse(wire).value`, context);
  const metadata = JSON.parse(JSON.stringify(vm.runInContext(metadataExpression(probe, projects), context)));
  delete metadata.envelope;
  metadata.predicateBasis = "Actual query-cache seal request or authorized open response value";
  const value = JSON.parse(wire).value;
  for (const [index, query] of value.clientState.queries.entries()) {
    metadata.queries[index].identitySha256 = digest(query.queryHash);
    const rows = Array.isArray(query.state.data) ? query.state.data : query.state.data?.posts;
    if (Array.isArray(rows) && rows.every((row) => typeof row?.id === "string")) {
      metadata.queries[index].rowIdsSha256 = digest(JSON.stringify(rows.map((row) => row.id).sort()));
    }
  }
  return metadata;
}

/** Run only inside the actual persistClient frame; return no query bodies or identifiers. */
export function metadataExpression(probe, projects) {
  return `(()=>{const value=${probe.parameter};const ordinary=(${probe.budgetSource});const measured=(${probe.diagnosticSource});const extended=(${probe.extendedSource});
    const rowCount=(data)=>Array.isArray(data)?data.length:null;
    const groups=new Map();const projects=${JSON.stringify(projects)};
    const queries=value.clientState.queries.map(query=>{const key=query.queryKey;const prefix=typeof key[0]==="string"&&/^[a-z-]{1,50}$/.test(key[0])?key[0]:"other";
      const scope=projects.includes(key[1])?"synthetic-project-"+(projects.indexOf(key[1])+1):key[0]==="me"?"account":"other";
      const group=prefix+":"+scope;groups.set(group,(groups.get(group)||0)+1);
      return{prefix,scope,rows:rowCount(query.state.data),collections:Object.fromEntries(Object.entries(query.state.data||{}).filter(([,item])=>Array.isArray(item)).map(([name,items])=>[/^[a-zA-Z-]{1,50}$/.test(name)?name:"other",items.length])),
        state:query.state.status,budget:measured(query),fullTraversal:extended(query,Infinity)};});
    const raw=localStorage.getItem("minddy.query-cache");let envelope=null;try{const saved=JSON.parse(raw);envelope={present:!!saved,formatMatches:saved?.format==="minddy-local-v1",encodedBytes:raw?new TextEncoder().encode(raw).length:0}}catch{envelope={present:!!raw,invalid:true}};
    return{productionFits:ordinary(value),productionTraversal:measured(value),fitsWithoutByteLimit:ordinary(value,Infinity),boundedFullTraversal:extended(value,Infinity),
      selectedQueries:queries.length,pausedMutations:value.clientState.mutations.length,groups:Object.fromEntries(groups),queries,envelope,
      predicateBasis:"Actual provider-selected PersistedClient argument, captured before production budget preflight"};})()`;
}
