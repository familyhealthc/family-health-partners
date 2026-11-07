import {DatabaseSync} from 'node:sqlite';
import {createStoreClass} from './store-core.mjs';
export {initialRules} from './store-core.mjs';
export const Store=createStoreClass(DatabaseSync);
