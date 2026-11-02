import { isAlias, isNode, parseAllDocuments, visit } from 'yaml'

const paths = new Bun.Glob('**/*.{yml,yaml}')
let failed = false
for await (const path of paths.scan({ dot: true, onlyFiles: true })) {
  if (path.startsWith('node_modules/') || path.startsWith('dist/')) continue
  const source = await Bun.file(path).text()
  const documents = parseAllDocuments(source, { uniqueKeys: true, strict: true, version: '1.2' })
  const errors: Error[] = documents.flatMap((document) => [
    ...document.errors,
    ...document.warnings,
  ])
  for (const document of documents)
    visit(document, (_key, node) => {
      if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor))
        errors.push(new Error('YAML anchors and aliases are not allowed'))
    })
  if (documents.length !== 1) errors.push(new Error('Exactly one YAML document is required'))
  for (const error of errors) {
    console.error(`${path}: ${error.message}`)
    failed = true
  }
}
if (failed) process.exit(1)
console.log('YAML files passed strict YAML 1.2 validation')
