import type { EOExpressionProp } from '../ast';
import {
  isEOMethod,
  isEOPropertyForActionsObject,
  isEOPropertyForClassDecorator,
  isEOPropertySimple,
  isEOPropertyWithCallExpression,
  isEOPropertyWithFunctionExpression,
} from '../ast';
import type { DecoratorImportInfoMap } from '../decorator-info';
import type { Options } from '../options';
import { assert } from '../util/types';
import EOActionsProp from './private/actions';
import type EOComputedFunctionExpressionProp from './private/call-expression/function-expression';
import { makeEOCallExpressionProp } from './private/call-expression/index';
import type EOComputedObjectExpressionProp from './private/call-expression/object-expression';
import type EODecoratedProp from './private/call-expression/property';
import EOClassDecorator from './private/class-decorator';
import EOFunctionExpressionProp from './private/function-expression';
import EOMethodProp from './private/method';
import EOSimpleProp from './private/simple';

export { default as EOActionsProp } from './private/actions';
// Intentionally not included in EOProp union type.
export { default as EOClassDecorator } from './private/class-decorator';

export type EOProp =
  | EOActionsProp
  | EOSimpleProp
  | EOComputedFunctionExpressionProp
  | EOComputedObjectExpressionProp
  | EODecoratedProp
  | EOFunctionExpressionProp
  | EOMethodProp;

/**
 * Makes an object representing an Ember Object property for the given
 * Property, RuntimeData, and ImportPropDecoratorMap.
 */
export default function makeEOProp(
  eoProp: EOExpressionProp,
  existingDecoratorImportInfos: DecoratorImportInfoMap,
  options: Options
): EOProp | EOClassDecorator {
  if (isEOPropertyWithCallExpression(eoProp)) {
    return makeEOCallExpressionProp(
      eoProp,
      existingDecoratorImportInfos,
      options
    );
  } else if (isEOMethod(eoProp)) {
    return new EOMethodProp(eoProp, options);
  } else if (isEOPropertyWithFunctionExpression(eoProp)) {
    return new EOFunctionExpressionProp(eoProp, options);
  } else if (isEOPropertyForClassDecorator(eoProp)) {
    return new EOClassDecorator(eoProp, options);
  } else if (isEOPropertyForActionsObject(eoProp)) {
    return new EOActionsProp(eoProp, options);
  } else {
    assert(isEOPropertySimple(eoProp));
    return new EOSimpleProp(eoProp, options);
  }
}
