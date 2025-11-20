const fs = require("node:fs");
const pkg = require("./package.json");

const content = `
export const VERSION = "${pkg.version}";
export const NAME = "${pkg.name}";
`;

fs.writeFileSync("server/src/perlnavigator.ts", content);
console.log("Generated server/src/perlnavigator.ts");
