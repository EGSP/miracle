/**
 * Добавляет проп `as`, который позволяет задать,
 * каким элементом или компонентом будет рендериться текущий компонент.
 *
 * Пример:
 * <Column as="a" />
 * <Column as="section" />
 */
type AsProp<C extends React.ElementType> = {
    as?: C;
  };
  
  /**
   * Вычисляет набор ключей, которые нужно исключить из пропсов HTML-элемента.
   *
   * Почему это нужно:
   * - у нас есть собственные пропсы компонента (Props)
   * - плюс проп `as`
   * - и есть пропсы выбранного элемента (например, <a>, <button>, и т.д.)
   *
   * Если просто объединить их через "&", возможны конфликты имён.
   * Поэтому мы заранее определяем ключи, которые нужно убрать.
   */
  type PropsToOmit<C extends React.ElementType, P> =
    keyof (AsProp<C> & P);
  
  /**
   * Основной polymorphic-тип БЕЗ поддержки ref.
   *
   * Что он делает:
   * 1. Добавляет children (через PropsWithChildren)
   * 2. Добавляет кастомные пропсы компонента (Props)
   * 3. Добавляет проп `as`
   * 4. Подмешивает пропсы выбранного элемента (например, <a>)
   * 5. Удаляет конфликтующие пропсы через Omit
   *
   * В итоге:
   * компонент получает:
   * - свои пропсы
   * - children
   * - as
   * - корректные пропсы HTML-элемента
   */
  export type PolymorphicComponentProp<
    C extends React.ElementType,
    Props = Record<string, never>,
  > =
    React.PropsWithChildren<Props & AsProp<C>> &
    Omit<
      React.ComponentPropsWithoutRef<C>,
      PropsToOmit<C, Props>
    >;
  
  /**
   * Тип для ref, зависящий от выбранного элемента.
   *
   * Пример:
   * - если C = "div" → ref: HTMLDivElement
   * - если C = "a" → ref: HTMLAnchorElement
   * - если C = кастомный компонент → его тип ref
   */
  export type PolymorphicRef<C extends React.ElementType> =
    React.ComponentPropsWithRef<C>['ref'];
  
  /**
   * Расширение polymorphic-типа с поддержкой ref.
   *
   * Просто добавляет корректно типизированный ref
   * к уже собранному PolymorphicComponentProp.
   *
   * Используется в компонентах с forwardRef.
   */
  export type PolymorphicComponentPropWithRef<
    C extends React.ElementType,
    Props = Record<string, never>,
  > =
    PolymorphicComponentProp<C, Props> & {
      ref?: PolymorphicRef<C>;
    };