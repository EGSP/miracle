import React from 'react';

/** Число колонок текущей сетки — устанавливается Grid (root) и Column (при известном span). */
const GridColsContext = React.createContext<number>(16);

export { GridColsContext };

/** Читает число колонок ближайшей охватывающей сетки или колонки. */
export const useGridCols = () => React.useContext(GridColsContext);
