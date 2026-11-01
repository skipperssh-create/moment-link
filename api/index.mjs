import {createApp} from '../server/app.mjs';
import {waitUntil} from '@vercel/functions';
export default {fetch:createApp({schedule:waitUntil})};
