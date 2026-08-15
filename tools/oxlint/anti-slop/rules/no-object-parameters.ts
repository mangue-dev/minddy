import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.ts";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

type AliasScope = ESTree.BlockStatement | ESTree.Program | ESTree.TSModuleBlock;

interface AliasEntry {
	readonly scope: AliasScope;
	readonly type: ESTree.TSType;
}

function isNode(value: unknown): value is ESTree.Node {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string"
	);
}

function aliasScope(node: ESTree.TSTypeAliasDeclaration): AliasScope {
	let current: ESTree.Node = node.parent;
	while (
		current.type !== "Program" &&
		current.type !== "BlockStatement" &&
		current.type !== "TSModuleBlock"
	) {
		current = current.parent;
	}
	return current;
}

function collectAliases(
	node: ESTree.Node,
	visitorKeys: Readonly<Record<string, readonly string[]>>,
	aliases: Map<string, AliasEntry[]>,
): void {
	if (
		node.type === "TSTypeAliasDeclaration" &&
		(node.typeParameters === null || node.typeParameters === undefined)
	) {
		const entries = aliases.get(node.id.name) ?? [];
		entries.push({ scope: aliasScope(node), type: node.typeAnnotation });
		aliases.set(node.id.name, entries);
	}
	const record = node as unknown as Readonly<Record<string, unknown>>;
	for (const key of visitorKeys[node.type] ?? []) {
		const value = record[key];
		if (isNode(value)) {
			collectAliases(value, visitorKeys, aliases);
			continue;
		}
		if (!Array.isArray(value)) continue;
		for (const child of value) {
			if (isNode(child)) collectAliases(child, visitorKeys, aliases);
		}
	}
}

function distanceToScope(node: ESTree.Node, scope: AliasScope): number | null {
	let distance = 0;
	let current: ESTree.Node | null = node;
	while (current !== null) {
		if (current === scope) return distance;
		current = current.parent;
		distance += 1;
	}
	return null;
}

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === "TSParameterProperty") {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceCode: SourceCode): string {
	return parameter.type === "Identifier"
		? parameter.name
		: sourceCode.getText(parameter).replace(/\s*:\s*object\s*$/u, "");
}

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParametersRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
		},
		messages: {
			objectParameter:
				"Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.",
		},
	},
	createOnce(context) {
		const aliases = new Map<string, AliasEntry[]>();

		const resolvesToObject = (
			type: ESTree.TSType,
			shadowedAliases: ReadonlySet<string>,
			visited = new Set<string>(),
		): boolean => {
			if (type.type === "TSObjectKeyword") return true;
			if (type.type === "TSParenthesizedType")
				return resolvesToObject(type.typeAnnotation, shadowedAliases, visited);
			if (type.type === "TSUnionType") {
				return type.types.some((member) =>
					resolvesToObject(member, shadowedAliases, visited),
				);
			}
			if (
				type.type !== "TSTypeReference" ||
				type.typeName.type !== "Identifier" ||
				(type.typeArguments !== null &&
					type.typeArguments !== undefined &&
					type.typeArguments.params.length > 0) ||
				visited.has(type.typeName.name) ||
				shadowedAliases.has(type.typeName.name)
			) {
				return false;
			}
			const alias = aliases
				.get(type.typeName.name)
				?.map((entry) => ({ entry, distance: distanceToScope(type, entry.scope) }))
				.filter(
					(candidate): candidate is { entry: AliasEntry; distance: number } =>
						candidate.distance !== null,
				)
				.sort((left, right) => left.distance - right.distance)[0]?.entry.type;
			if (alias === undefined) return false;
			const nextVisited = new Set(visited);
			nextVisited.add(type.typeName.name);
			return resolvesToObject(alias, shadowedAliases, nextVisited);
		};

		const checkParameters = (node: ParameterOwner) => {
			const shadowedAliases = lexicalTypeParameterNames(
				node,
				context.sourceCode.visitorKeys,
			);
			for (const parameter of node.params) {
				const annotation = parameterAnnotation(parameter);
				if (annotation === null || annotation === undefined) continue;
				if (!resolvesToObject(annotation.typeAnnotation, shadowedAliases)) continue;
				context.report({
					node: annotation.typeAnnotation,
					messageId: "objectParameter",
					data: { parameter: parameterName(parameter, context.sourceCode) },
				});
			}
		};

		return {
			Program(node) {
				aliases.clear();
				collectAliases(node, context.sourceCode.visitorKeys, aliases);
			},
			ArrowFunctionExpression: checkParameters,
			FunctionDeclaration: checkParameters,
			FunctionExpression: checkParameters,
			TSCallSignatureDeclaration: checkParameters,
			TSConstructSignatureDeclaration: checkParameters,
			TSConstructorType: checkParameters,
			TSDeclareFunction: checkParameters,
			TSEmptyBodyFunctionExpression: checkParameters,
			TSFunctionType: checkParameters,
			TSMethodSignature: checkParameters,
		};
	},
});
