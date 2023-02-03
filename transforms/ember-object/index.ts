import type { Transform } from 'jscodeshift';
import path from 'path';
import getConfig from '../helpers/config';
import maybeTransformEmberObjects from '../helpers/transform';

const transformer: Transform = function (
  { source, path: filePath },
  { jscodeshift: j }
) {
  const extension = path.extname(filePath);
  if (!['.js', '.ts'].includes(extension.toLowerCase())) {
    // do nothing on non-js/ts files
    return;
  }

  const root = j(source);
  const userOptions = getConfig();
  const replaced = maybeTransformEmberObjects(j, root, filePath, userOptions);

  if (replaced) {
    source = root.toSource({
      quote: userOptions.quotes ?? userOptions.quote,
    });
  }

  return source;
};

export default transformer;

// Set the parser, needed for supporting decorators
export { default as parser } from '../helpers/parse';
