import { registerRootComponent } from 'expo';

import App from './App';
// Import background location task to ensure it is registered at bundle initialization
import './src/services/presenceTracking';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
