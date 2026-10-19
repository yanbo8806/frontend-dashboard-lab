import './style.css';
import './dashboard.css';
import { bootstrap } from './app/bootstrap.js';

// 入口只负责装配样式与启动，具体业务按职责放在 app / components / config / gis。
void bootstrap(document.getElementById('stage'));
