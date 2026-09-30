import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parsePageSearchQuery, protectedPageExcerpt, rankPageSearch } from "./pages-search";

const container = process.env.MIN591_PG_ORACLE_CONTAINER;
if (process.env.MIN591_REQUIRE_PG_ORACLE === "1" && !container) {
  throw new Error("MIN591_PG_ORACLE_CONTAINER is required for the PostgreSQL search oracle");
}
const fixtures = [
  { id: "old-many", title: "", body: "alpha alpha alpha" },
  { id: "html-attributes", title: "", body: '<div data-label="alpha">ordinary text</div>' },
  { id: "html-callout", title: "", body: '<div data-kind="note" data-icon="fixture">' +
    Array.from({ length: 50 }, (_, index) => index === 10 ? "alpha" : `word${index + 1}`).join(" ") + '</div>' },

  { id: "new-one", title: "", body: "alpha" },
  { id: "title", title: "alpha", body: "ordinary text" },
  { id: "title-only-punctuation", title: "alpha", body: "Sentence." },
  { id: "close", title: "", body: "alpha beta alpha beta" },
  { id: "far", title: "", body: "alpha x x beta" },
  { id: "reverse", title: "", body: "beta alpha" },
  { id: "punctuation", title: "", body: "alpha, beta!" },
  { id: "hyphen", title: "", body: "alpha-beta" },
  { id: "slash", title: "", body: "alpha/beta" },
  { id: "dotted-proximity", title: "", body: "alpha foo.bar beta" },
  { id: "apostrophe", title: "", body: "can't" },
  { id: "apostrophe-gap", title: "", body: "can x t" },
  { id: "slash-hyphen", title: "", body: "alpha/beta-gamma" },
  { id: "host-hyphen", title: "", body: "foo.bar-baz" },
  { id: "hyphen-path", title: "", body: "alpha-beta/gamma" },
  { id: "host-path", title: "", body: "alpha.beta/gamma" },
  { id: "url", title: "", body: "https://foo.bar/baz" },
  { id: "url-in-sentence", title: "", body: "alpha https://foo.bar/baz" },
  { id: "email", title: "", body: "foo@example.com" },
  { id: "email-parts", title: "", body: "foo example.com" },
  { id: "hyphen-email", title: "", body: "a-b@example.com" },
  { id: "ip", title: "", body: "192.168.1.1" },
  { id: "ip-parts", title: "", body: "192 168 1 1" },
  { id: "cjk", title: "", body: "北京大学 東京大学" },
  { id: "cjk-parts", title: "", body: "北京 大学 東京 大学" },
  { id: "long", title: "", body: Array.from({ length: 50 }, (_, index) =>
    index === 29 ? "alpha" : `word${index + 1}`).join(" ") },
  { id: "best-fragment", title: "", body: ["alpha",
    ...Array.from({ length: 27 }, (_, index) => `early${index + 1}`),
    "alpha", "beta", ...Array.from({ length: 12 }, (_, index) => `late${index + 1}`)]
    .join(" ") },
  { id: "or-excluded-branch", title: "", body: "alpha beta gamma" },
  { id: "or-rank-a", title: "", body: "alpha beta beta gamma" },
  { id: "or-rank-b", title: "", body: "alpha alpha" },
];
const queries = ["alpha", "alpha beta", "alpha OR beta", "alpha -beta",
  '"alpha beta"', "alpha, beta", "alpha-beta", "alpha:beta",
  '"alpha, beta"', "alpha OR beta -x", "alpha OR beta -gamma", "-beta",
  "alpha/beta", "foo.bar", "can't", "alpha --beta", "alpha OR OR beta",
  "alpha,beta", "alpha/beta-gamma", "foo.bar-baz", "alpha-beta/gamma",
  "alpha.beta/gamma", "https", "foo.bar/baz", "https://foo.bar/baz",
  "foo@example.com", "foo example.com", "a-b@example.com", "192.168.1.1",
  "192 168 1 1", "北京大学", "北京", "東京大学", "東京"];

const differentialQueries = ["alpha", "alpha beta", "alpha OR beta", "alpha -beta",
  '"alpha beta"', "alpha-beta", '"alpha-beta"', "alpha OR beta -gamma",
  "alpha beta OR gamma", "alpha OR beta gamma", "alpha beta gamma",
  "alpha OR beta OR gamma", "alpha -beta OR gamma", "-alpha", "alpha alpha",
  '"alpha alpha"', "a-b", "can't", "hello_world", "42", "café", "foo.bar",
  "alpha/beta", "alpha:beta", "alpha & beta", "alpha | beta", "alpha !beta",
  '"alpha, beta"', '"alpha beta" OR gamma', 'alpha OR "beta gamma"',
  'alpha -"beta gamma"', "alpha -(beta)", "alpha OR OR beta", "(alpha beta)",
  "alpha, beta", '"alpha" beta', "alpha --beta", "alpha OR foo.bar -gamma",
  "foo@example.com", "foo example.com", "192.168.1.1", "192 168 1 1",
  "北京大学", "北京", "東京大学", "東京"];

function differentialFixtures(): Array<{ id: number; title: string; body: string }> {
  let seed = 91;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const vocabulary = ["alpha", "beta", "gamma", "delta", "x", "a-b",
    "alpha-beta", "z", "can't", "hello_world", "42", "café", "foo.bar", "alpha/beta",
    "foo@example.com", "192.168.1.1", "北京大学", "東京大学"];
  return Array.from({ length: 200 }, (_, id) => ({
    id,
    title: Array.from({ length: Math.floor(next() * 5) }, () =>
      vocabulary[Math.floor(next() * vocabulary.length)]).join(" "),
    body: Array.from({ length: 1 + Math.floor(next() * 35) }, () =>
      vocabulary[Math.floor(next() * vocabulary.length)]).join(" "),
  }));
}

function rankFingerprint(rows: Array<{ id: number; rank: number }>): string {
  const ordered = rows.sort((a, b) => b.rank - a.rank || a.id - b.id);
  return createHash("sha256").update(ordered.map((row) =>
    `${row.id}:${row.rank.toFixed(3)}`).join(",")).digest("hex");
}

// PostgreSQL 17's simple parser and ts_rank_cd over the deterministic corpus.
// Each digest includes the complete rank and ID ordering, including limit=1.
const recordedFingerprints = [
  "6b9f01defb98c04819415668ebe9b946de78338427ecd765954342be43da00d6",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "d4a5e94422fa148835be955fc7185669a38892daaf2a8f9911b9375364b84dfb",
  "0a1bd705cdb17f7d262ba00fe58d07e94e0fb42a22e6775a5109ae7bb578f58d",
  "7111565f55cd2595d5234630a9b181f9fa3fccb8cbc5ceba3af366dd48d1595e",
  "8e151777aa786beb77b167f146641d3da8110bcf508e308e807e5e7a07b8cfc1",
  "8e151777aa786beb77b167f146641d3da8110bcf508e308e807e5e7a07b8cfc1",
  "633c0f9267c80a386cc60ba748b29f3934d34ae1c51700b6a7307c3a60bbdd4e",
  "2e3a04437d61904d64003cfd67ba6de23cd360052e58fce668ca3827233c451b",
  "05f868c0f2ec62fb05ced6c4bfe722560e92aadd98b9f40d7cb464ceb4332d27",
  "a50edf8dc35b6711db6ed8adc43f30ef355975c9a6410a3b51857543015a8db8",
  "648ca61d9ab2a7a177187c6a7a9cdecd40f2501adc7e7f933ad33c7972e4c4e4",
  "6f5a0fd816db895075828637d41f8b2f6157eb935db32cd628e4a2c145134080",
  "93366bc5d9cbd6f6478f8a1c2e2df968210cb95af866ebad4a65036afb026be1",
  "6b9f01defb98c04819415668ebe9b946de78338427ecd765954342be43da00d6",
  "d3cc0be0fc88b922acaa96b81fd63aafdee5e3bd9d07800d8ae4609be4dc6582",
  "796045081a9fe12e224eb3852a79999142719496c9f6fd77b059d3423ac0e471",
  "1d0231d769d6da8cab33f62fd62e1b075fb6bda0b2325e1744b125ce5888cb85",
  "7e9183abde52ed743e81d7a1a612e8afecc6314839b93f76d737526bac64ba5a",
  "50264d3ed78eecd760ed63adb9122dc9b26ea551ad29098a83581de3bc60cc06",
  "6397edecc07c5e525a05f11f0b2a3db534e536079beddbb8682a27f416dc8a51",
  "a581dd3d3fe76f913a87c30d27ec81342899641ca5b7280df043c1e39a4a0a06",
  "8497f9b38bb91798b063e59c91936ddee30adb34bf3bee5813ede35434e9b918",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "7111565f55cd2595d5234630a9b181f9fa3fccb8cbc5ceba3af366dd48d1595e",
  "1fde695336d8619d8bbf673a2c91f4719f5d2e973b5a336d002394d1b36f6819",
  "2eea519e303293033f21ccbc4c5737326d2d2085227832306b5a0137aa053594",
  "e2afa91d91bcefe200d82163ae32982d73a482cedddaac54f36710eb5b857dcd",
  "0a1bd705cdb17f7d262ba00fe58d07e94e0fb42a22e6775a5109ae7bb578f58d",
  "6b9f01defb98c04819415668ebe9b946de78338427ecd765954342be43da00d6",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "40c7204601924b2bc280c07392fd9ac0ba82e1db30586eb322af279d81ce34b2",
  "bc43dfe11543da1c7020af253f90d057289602a1596f5924c10aba3016bff1b4",
  "fa323ce90cb5c53ed05b5ba385c073405977fdae8292fbc6e7531c23415d9f72",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "98d1b2e81128fae2a9aaf2e0622a870dfa1c8e4cfe864933b8b6c26375b97d3b",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "366a31e28816bbc38f84736b111a40328c6f83dd31b1c565713ef493af615b59",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "a2272460f7a90ba34467807a2ec9a91abbb6f9eb8989e2c2422de01017555b7f",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
];

it("keeps the decisive recorded PostgreSQL search oracle in every test run", () => {
  expect(rankPageSearch("", "alpha alpha alpha", parsePageSearchQuery("alpha")))
    .toBeCloseTo(1.2);
  expect(rankPageSearch("", "alpha", parsePageSearchQuery("alpha")))
    .toBeCloseTo(0.4);
  const body = fixtures.find((row) => row.id === "best-fragment")!.body;
  expect(protectedPageExcerpt(body, parsePageSearchQuery("alpha beta")))
    .toBe([...Array.from({ length: 10 }, (_, index) => `early${index + 18}`),
      "alpha", "beta", ...Array.from({ length: 10 }, (_, index) =>
        `late${index + 1}`)].join(" "));
  expect(protectedPageExcerpt(body, parsePageSearchQuery("alpha OR beta")))
    .toBe(["alpha", ...Array.from({ length: 21 }, (_, index) =>
      `early${index + 1}`)].join(" "));
  expect(rankPageSearch("", "alpha beta beta gamma",
    parsePageSearchQuery("alpha OR beta -gamma")))
    .toBeCloseTo(1.2);
  expect(rankPageSearch("", "alpha alpha",
    parsePageSearchQuery("alpha OR beta -gamma")))
    .toBeCloseTo(0.8);
  expect(rankPageSearch("", "alpha foo.bar beta",
    parsePageSearchQuery("alpha beta")))
    .toBeCloseTo(0.2);
  expect(rankPageSearch("", "alpha beta",
    parsePageSearchQuery("alpha/beta")))
    .toBeNull();
  expect(rankPageSearch("", "foo@example.com",
    parsePageSearchQuery("foo@example.com")))
    .toBeCloseTo(0.4);
  expect(rankPageSearch("", "foo@example.com",
    parsePageSearchQuery("foo example.com")))
    .toBeNull();
  expect(rankPageSearch("", "foo example.com",
    parsePageSearchQuery("foo@example.com")))
    .toBeNull();
  expect(rankPageSearch("", "192.168.1.1",
    parsePageSearchQuery("192 168 1 1")))
    .toBeNull();
  expect(rankPageSearch("", "北京大学",
    parsePageSearchQuery("北京")))
    .toBeNull();
  expect(rankPageSearch("", "北京 大学",
    parsePageSearchQuery("北京大学")))
    .toBeNull();
});

it("keeps the recorded PostgreSQL rank and ID order across 9,200 search cases", () => {
  const pages = differentialFixtures();
  expect(differentialQueries.map((query) => {
    const clauses = parsePageSearchQuery(query);
    return rankFingerprint(pages.flatMap((page) => {
      const rank = rankPageSearch(page.title, page.body, clauses);
      return rank === null ? [] : [{ id: page.id, rank }];
    }));
  })).toEqual(recordedFingerprints);
});

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe.skipIf(!container)("PostgreSQL page-search ranking oracle", () => {
  it("rechecks the recorded differential corpus against isolated PostgreSQL", () => {
    const pages = differentialFixtures();
    const values = pages.map((row) =>
      `(${row.id},${sqlLiteral(row.title)},${sqlLiteral(row.body)})`).join(",");
    const queryValues = differentialQueries.map((query, index) =>
      `(${index},${sqlLiteral(query)})`).join(",");
    const statement = `WITH source(id,title,body) AS (VALUES ${values}), ` +
      `queries(qid,q) AS (VALUES ${queryValues}), vectors AS ` +
      "(SELECT id,setweight(to_tsvector('simple',title),'A') || " +
      "setweight(to_tsvector('simple',body),'B') AS v FROM source) " +
      "SELECT id,qid,ts_rank_cd(v,websearch_to_tsquery('simple',q)) " +
      "FROM vectors,queries WHERE v @@ websearch_to_tsquery('simple',q) ORDER BY qid,id";
    const result = spawnSync("docker", ["exec", container!, "psql", "-U", "postgres",
      "-d", "postgres", "-At", "-F", "|", "-c", statement],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    expect(result.status, result.stderr).toBe(0);
    const expected = new Map(result.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [id, query, rank] = line.split("|");
      return [`${query}-${id}`, Number(rank)];
    }));
    expect(differentialQueries.map((query, queryIndex) => {
      const clauses = parsePageSearchQuery(query);
      const actualRows = pages.flatMap((page) => {
        const rank = rankPageSearch(page.title, page.body, clauses);
        const sqlRank = expected.get(`${queryIndex}-${page.id}`);
        expect(rank === null, `${query}: ${page.id} match`).toBe(sqlRank === undefined);
        if (rank === null || sqlRank === undefined) return [];
        expect(rank, `${query}: ${page.id} rank`).toBeCloseTo(sqlRank, 5);
        return [{ id: page.id, rank }];
      });
      const sqlRows = pages.flatMap((page) => {
        const rank = expected.get(`${queryIndex}-${page.id}`);
        return rank === undefined ? [] : [{ id: page.id, rank }];
      });
      expect(rankFingerprint(actualRows), `${query} ordered IDs and rank`)
        .toBe(rankFingerprint(sqlRows));
      return rankFingerprint(sqlRows);
    })).toEqual(recordedFingerprints);
  });

  it("matches SQL cover-density rank and ordered limits for occurrence, proximity and grammar", () => {
    for (const query of queries) {
      const values = fixtures.map((row) =>
        `(${sqlLiteral(row.id)},${sqlLiteral(row.title)},${sqlLiteral(row.body)})`).join(",");
      const command = `WITH source(id,title,body) AS (VALUES ${values}), ` +
        `query AS (SELECT websearch_to_tsquery('simple',${sqlLiteral(query)}) AS value) ` +
        "SELECT source.id, ts_rank_cd(setweight(to_tsvector('simple',source.title),'A') || " +
        "setweight(to_tsvector('simple',source.body),'B'),query.value), " +
        "ts_headline('simple',source.body,query.value,'StartSel=\"\", StopSel=\"\", MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter=\" … \"') " +
        "FROM source,query WHERE (setweight(to_tsvector('simple',source.title),'A') || " +
        "setweight(to_tsvector('simple',source.body),'B')) @@ query.value " +
        "ORDER BY 2 DESC, source.id ASC";
      const result = spawnSync("docker", ["exec", container!, "psql", "-U", "postgres",
        "-d", "postgres", "-At", "-F", "|", "-c", command], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const expected = result.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [id, rank, excerpt] = line.split("|");
        return { id, rank: Number(rank), excerpt };
      });
      const actual = fixtures.map((row) => ({ id: row.id,
        rank: rankPageSearch(row.title, row.body, parsePageSearchQuery(query)) }))
        .filter((row): row is { id: string; rank: number } => row.rank !== null)
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
      expect(actual.map((row) => row.id), query).toEqual(expected.map((row) => row.id));
      for (let index = 0; index < actual.length; index += 1) {
        expect(actual[index].rank, `${query}: ${actual[index].id}`)
          .toBeCloseTo(expected[index].rank, 5);
        const source = fixtures.find((row) => row.id === actual[index].id)!;
        expect(protectedPageExcerpt(source.body, parsePageSearchQuery(query)),
          `${query}: ${source.id} excerpt`)
          .toBe(expected[index].excerpt.trim());
      }
      expect(actual.slice(0, 1).map((row) => row.id))
        .toEqual(expected.slice(0, 1).map((row) => row.id));
    }
  });

  it("matches the actual search_pages limit and RLS permission boundary", () => {
    const database = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE ??
      "minddy_min591_final_review";
    const actor = "59100000-0000-4000-8000-000000000001";
    const outsider = "59100000-0000-4000-8000-000000000002";
    const project = "59100000-0000-4000-8000-000000000003";
    const privateProject = "59100000-0000-4000-8000-000000000004";
    const oldMany = "59100000-0000-4000-8000-000000000005";
    const newOne = "59100000-0000-4000-8000-000000000006";
    const hidden = "59100000-0000-4000-8000-000000000007";
    const statement = `BEGIN;
      INSERT INTO auth.users(id) VALUES('${actor}'),('${outsider}');
      INSERT INTO public.projects(id,owner_id,name,key) VALUES
        ('${project}','${actor}','Search oracle','SRO'),
        ('${privateProject}','${outsider}','Hidden oracle','SHO');
      INSERT INTO public.pages(id,project_id,position,title,search_text,created_by,updated_at)
        VALUES('${oldMany}','${project}','a','','alpha alpha alpha','${actor}',now()-interval '1 year'),
          ('${newOne}','${project}','b','','alpha','${actor}',now()),
          ('${hidden}','${privateProject}','a','','alpha alpha alpha alpha','${outsider}',now());
      SELECT set_config('request.jwt.claims',
        jsonb_build_object('role','authenticated','sub','${actor}')::text,true);
      SET LOCAL ROLE authenticated;
      SELECT jsonb_build_object(
        'limited',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'excerpt',excerpt))
          FROM public.search_pages('alpha','${project}',1)),'[]'::jsonb),
        'all',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'excerpt',excerpt))
          FROM public.search_pages('alpha',NULL,20)),'[]'::jsonb),
        'hidden',coalesce((SELECT jsonb_agg(id) FROM public.search_pages('alpha','${privateProject}',20)),'[]'::jsonb));
      ROLLBACK;`;
    const result = spawnSync("docker", ["exec", container!, "psql", "-U",
      "supabase_admin", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1",
      "-c", statement], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const proof = JSON.parse(lines.at(-1)!);
    expect(proof.limited).toEqual([{ id: oldMany, excerpt: "alpha alpha alpha" }]);
    expect(proof.all).toEqual([{ id: oldMany, excerpt: "alpha alpha alpha" },
      { id: newOne, excerpt: "alpha" }]);
    expect(proof.hidden).toEqual([]);
    expect(rankPageSearch("", "alpha alpha alpha", parsePageSearchQuery("alpha")))
      .toBeGreaterThan(rankPageSearch("", "alpha", parsePageSearchQuery("alpha"))!);
  });
});
