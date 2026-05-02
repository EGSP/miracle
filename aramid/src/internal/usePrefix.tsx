import React from 'react';

export const PrefixContext = React.createContext('aramid');

export function usePrefix() {
    return React.useContext(PrefixContext);
}