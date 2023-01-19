import camelCase from 'camelcase';
import type {
  ASTPath,
  CallExpression,
  Collection,
  JSCodeshift,
  ObjectExpression,
  VariableDeclaration,
} from 'jscodeshift';
import path from 'path';
import type { DecoratorImportInfoMap } from './decorator-info';
import type { EOProp, EOProps } from './eo-prop/index';
import makeEOProp, {
  EOActionsObjectProp,
  EOClassDecoratorProp,
} from './eo-prop/index';
import type { RuntimeData } from './runtime-data';
import {
  capitalizeFirstLetter,
  dig,
  startsWithUpperCaseLetter,
} from './util/index';
import {
  assert,
  defined,
  isPropertyNode,
  isRecord,
  isString,
  verified,
} from './util/types';

/**
 * Return the map of instance props and functions from Ember Object
 *
 * For example
 * const myObj = EmberObject.extend({ key: value });
 * will be parsed as:
 * {
 *   instanceProps: [ Property({key: value}) ]
 *  }
 */
export function getEmberObjectProps(
  eoExpression: ObjectExpression | null,
  existingDecoratorImportInfos: DecoratorImportInfoMap,
  runtimeData: RuntimeData | undefined
): EOProps {
  const objProps = eoExpression?.properties ?? [];

  return {
    instanceProps: objProps.map((objProp) =>
      makeEOProp(
        verified(objProp, isPropertyNode),
        runtimeData,
        existingDecoratorImportInfos
      )
    ),
  };
}

export interface DecoratorImportSpecs {
  action: boolean;
  classNames: boolean;
  classNameBindings: boolean;
  attributeBindings: boolean;
  layout: boolean;
  templateLayout: boolean;
  off: boolean;
  tagName: boolean;
  unobserves: boolean;
}

/**
 * Get the map of decorators to import other than the computed props, services etc
 * which already have imports in the code
 */
export function getDecoratorsToImportSpecs(
  instanceProps: EOProp[],
  existingSpecs: DecoratorImportSpecs
): DecoratorImportSpecs {
  let specs = existingSpecs;
  for (const prop of instanceProps) {
    specs = {
      action: specs.action || prop instanceof EOActionsObjectProp,
      classNames:
        specs.classNames ||
        (prop instanceof EOClassDecoratorProp && prop.isClassNames),
      classNameBindings:
        specs.classNameBindings ||
        (prop instanceof EOClassDecoratorProp && prop.isClassNameBindings),
      attributeBindings:
        specs.attributeBindings ||
        (prop instanceof EOClassDecoratorProp && prop.isAttributeBindings),
      layout:
        specs.layout ||
        (prop instanceof EOClassDecoratorProp && prop.isLayoutDecorator),
      templateLayout:
        specs.templateLayout ||
        (prop instanceof EOClassDecoratorProp &&
          prop.isTemplateLayoutDecorator),
      off: specs.off || prop.hasOffDecorator,
      tagName:
        specs.tagName ||
        (prop instanceof EOClassDecoratorProp && prop.isTagName),
      unobserves: specs.unobserves || prop.hasUnobservesDecorator,
    };
  }
  return specs;
}

/** Find the `EmberObject.extend` statements */
export function getEmberObjectCallExpressions(
  j: JSCodeshift,
  root: Collection<unknown>
): Collection<CallExpression> {
  return root
    .find(j.CallExpression, { callee: { property: { name: 'extend' } } })
    .filter((eoCallExpression) => {
      return (
        'object' in eoCallExpression.value.callee &&
        eoCallExpression.value.callee.object !== null &&
        'name' in eoCallExpression.value.callee.object &&
        typeof eoCallExpression.value.callee.object.name === 'string' &&
        startsWithUpperCaseLetter(eoCallExpression.value.callee.object.name) &&
        dig(eoCallExpression, 'parentPath.value.type', isString) !==
          'ClassDeclaration'
      );
    });
}

function isASTPathOfVariableDeclaration(
  value: unknown
): value is ASTPath<VariableDeclaration> {
  return (
    isRecord(value) &&
    isRecord(value['node']) &&
    value['node']['type'] === 'VariableDeclaration'
  );
}

/** Return closest parent var declaration statement */
export function getClosestVariableDeclaration(
  j: JSCodeshift,
  eoCallExpression: ASTPath<CallExpression>
): ASTPath<VariableDeclaration> | null {
  const varDeclarations = j(eoCallExpression).closest(j.VariableDeclaration);
  return varDeclarations.length > 0
    ? verified(varDeclarations.get(), isASTPathOfVariableDeclaration)
    : null;
}

/**
 * Get the expression to replace
 *
 * It returns either VariableDeclaration or the CallExpression depending on how the object is created
 */
export function getExpressionToReplace(
  j: JSCodeshift,
  eoCallExpression: ASTPath<CallExpression>
): ASTPath<CallExpression> | ASTPath<VariableDeclaration> {
  const varDeclaration = getClosestVariableDeclaration(j, eoCallExpression);
  const parentValue = dig(eoCallExpression, 'parentPath.value', isRecord);
  const isFollowedByCreate =
    isRecord(parentValue['property']) &&
    parentValue['property']['name'] === 'create';

  let expressionToReplace:
    | ASTPath<CallExpression>
    | ASTPath<VariableDeclaration> = eoCallExpression;
  if (varDeclaration && !isFollowedByCreate) {
    expressionToReplace = varDeclaration;
  }
  return expressionToReplace;
}

/** Returns name of class to be created */
export function getClassName(
  j: JSCodeshift,
  eoCallExpression: ASTPath<CallExpression>,
  filePath: string,
  type = ''
): string {
  const varDeclaration = getClosestVariableDeclaration(j, eoCallExpression);
  if (varDeclaration) {
    const firstDeclarator = defined(varDeclaration.value.declarations[0]);
    assert(
      firstDeclarator.type === 'VariableDeclarator',
      'expected firstDeclarator to be a VariableDeclarator'
    );

    const identifier = firstDeclarator.id;
    assert(
      identifier.type === 'Identifier',
      'expected firstDeclarator.id to be an Identifier'
    );

    return identifier.name;
  }

  let className = capitalizeFirstLetter(
    camelCase(path.basename(filePath, 'js'))
  );
  const capitalizedType = capitalizeFirstLetter(type);

  if (capitalizedType === className) {
    className = capitalizeFirstLetter(
      camelCase(path.basename(path.dirname(filePath)))
    );
  }

  if (!['Component', 'Helper', 'EmberObject'].includes(type)) {
    className = `${className}${capitalizedType}`;
  }

  return className;
}

type EOCallExpressionArgs = ASTPath<CallExpression>['value']['arguments'];

type EOCallExpressionArg = EOCallExpressionArgs[number];

export type EOCallExpressionMixin = Exclude<
  EOCallExpressionArg,
  ObjectExpression
>;

interface EOCallExpressionProps {
  eoExpression: ObjectExpression | null;
  mixins: EOCallExpressionMixin[];
}

/**
 * Parse ember object call expression, returns EmberObjectExpression and list of mixins
 */
export function parseEmberObjectCallExpression(
  eoCallExpression: ASTPath<CallExpression>
): EOCallExpressionProps {
  const callExpressionArgs = eoCallExpression.value.arguments;
  const props: EOCallExpressionProps = {
    eoExpression: null,
    mixins: [],
  };
  for (const callExpressionArg of callExpressionArgs) {
    if (callExpressionArg.type === 'ObjectExpression') {
      props.eoExpression = callExpressionArg;
    } else {
      props.mixins.push(callExpressionArg);
    }
  }
  return props;
}
