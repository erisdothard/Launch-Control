// Raw-string loader for .glsl files (Turbopack path; webpack uses `asset/source`).
module.exports = function glslLoader(source) {
  return `export default ${JSON.stringify(source)};`;
};
