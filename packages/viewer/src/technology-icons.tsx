import {
  Express,
  Hono,
  Mongodb,
  Mysql,
  Neon,
  Pinecone,
  Postgresql,
  Prisma,
  Redis,
  Sqlite,
  Supabase,
  Zod,
} from "@dev.icons/react";
import { type GraphNode, technologyNames } from "@nazs/flowlens-core";

const databaseBrands = [
  {
    name: "Pinecone",
    Icon: Pinecone,
    packages: ["@pinecone-database/pinecone", "pinecone"],
  },
  {
    name: "SQLite",
    Icon: Sqlite,
    packages: ["better-sqlite3", "sqlite3", "sqlite", "node:sqlite"],
  },
  {
    name: "PostgreSQL",
    Icon: Postgresql,
    packages: ["pg", "postgres", "@prisma/adapter-pg"],
  },
  { name: "MongoDB", Icon: Mongodb, packages: ["mongodb", "mongoose"] },
  {
    name: "Redis",
    Icon: Redis,
    packages: ["redis", "ioredis", "@upstash/redis"],
  },
  { name: "MySQL", Icon: Mysql, packages: ["mysql", "mysql2"] },
  { name: "Neon", Icon: Neon, packages: ["@neondatabase/serverless"] },
  { name: "Supabase", Icon: Supabase, packages: ["@supabase/supabase-js"] },
  { name: "Prisma", Icon: Prisma, packages: ["@prisma/client", "prisma"] },
];

const toolBrands = [
  { name: "Hono", Icon: Hono, packages: ["hono", "@hono/node-server"] },
  { name: "Express", Icon: Express, packages: ["express"] },
  { name: "Zod", Icon: Zod, packages: ["zod"] },
];

export function TechnologyIcons({ node }: { node: GraphNode }) {
  const names = new Set(technologyNames(node));
  if (typeof node.meta.external === "string") names.add(node.meta.external);
  const isDatabase = [
    node.label,
    node.parentId,
    node.file,
    node.meta.functionId,
  ].some(
    (field) =>
      typeof field === "string" &&
      /(?:^|[/:#_-])(?:db|database)(?:$|[/:#_.-])/i.test(field),
  );
  const matches = ({ packages }: { packages: string[] }) =>
    packages.some((name) => names.has(name));
  const databases = databaseBrands.filter(matches);
  const generic = isDatabase && !databases.length;
  const icons = [...databases, ...toolBrands.filter(matches)].slice(
    0,
    generic ? 1 : 2,
  );
  if (!icons.length && !isDatabase) return null;
  return (
    <span className="tech-icons">
      {icons.map(({ name, Icon }) => (
        <span key={name} role="img" aria-label={name} title={name}>
          <Icon size={14} aria-hidden="true" />
        </span>
      ))}
      {generic && (
        <span role="img" aria-label="Database" title="Database">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          </svg>
        </span>
      )}
    </span>
  );
}
