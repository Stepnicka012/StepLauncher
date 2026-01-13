import { HTMLFrameLoader } from './HTMLLoader.js';
import { createAndAttachLoadSettings } from './LoadSettings.js';

createAndAttachLoadSettings();

const loader = new HTMLFrameLoader('HTML_Container');

loader.register(
    { id: 'settings', url: './Application/Panels/Settings.html' },
);

// loader.open('settings');