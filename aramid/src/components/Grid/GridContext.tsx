import React from 'react';

export type GridMode = 'flexbox' | 'css-grid';

export interface GridSettingContext {

    /**
     * Specifies whether subgrid should be enabled
     */
    subgrid?: boolean;
}

/**
 * Provides a grid context for communication the grid "mode" (flexbox or
 * css-grid) along with subgrid information.
 */
const GridSettingsContext = React.createContext<GridSettingContext>({
    subgrid: false,
});

export interface GridSettingsProps {
    /**
     * Pass in components which will be rendered within the `GridSettings`
     * component
     */
    children?: React.ReactNode;

    /**
     * Specify whether subgrid should be enabled
     */
    subgrid?: boolean;
}

export const GridSettings = ({
    children,
    subgrid = false,
}: GridSettingsProps) => {
    const value = React.useMemo(() => {
        return {
            subgrid,
        };
    }, [subgrid]);
    return (
        <GridSettingsContext.Provider value={value}>
            {children}
        </GridSettingsContext.Provider>
    );
};

/**
 * Helper function for accessing the GridContext value
 */
export const useGridSettings = () => {
    return React.useContext(GridSettingsContext);
};