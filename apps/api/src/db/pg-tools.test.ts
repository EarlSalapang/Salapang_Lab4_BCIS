import { describe, expect, it } from "vitest";

import { connectionArgs, parseDatabaseUrl } from "./pg-tools.js";

describe("parseDatabaseUrl", () => {
  it("extracts connection parts from a DATABASE_URL", () => {
    const target = parseDatabaseUrl("postgresql://bcis:s3cret@db.office.local:6543/bcis_prod");
    expect(target).toEqual({
      host: "db.office.local",
      port: "6543",
      user: "bcis",
      password: "s3cret",
      database: "bcis_prod",
    });
  });

  it("defaults the port to 5432 and decodes escaped credentials", () => {
    const target = parseDatabaseUrl("postgresql://user%40office:p%40ss@localhost/bcis");
    expect(target.port).toBe("5432");
    expect(target.user).toBe("user@office");
    expect(target.password).toBe("p@ss");
    expect(target.database).toBe("bcis");
  });

  it("rejects a URL without a database name", () => {
    expect(() => parseDatabaseUrl("postgresql://bcis:secret@localhost:5432/")).toThrow(/database name/);
  });
});

describe("connectionArgs", () => {
  it("builds explicit connection flags so the password stays out of argv", () => {
    const args = connectionArgs({ host: "h", port: "5432", user: "u", password: "sup3r-secret", database: "d" });
    expect(args).toEqual(["--host=h", "--port=5432", "--username=u", "--dbname=d"]);
    expect(args.join(" ")).not.toContain("sup3r-secret");
  });
});
