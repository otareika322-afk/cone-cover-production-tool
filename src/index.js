import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TabletView from './TabletView';

// URLに ?view=tablet を付けてアクセスすると、作業者用タブレット画面を表示する
// 例: https://（このアプリのURL）/?view=tablet
const isTablet = new URLSearchParams(window.location.search).get('view') === 'tablet';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isTablet ? <TabletView /> : <App />}
  </React.StrictMode>
);
