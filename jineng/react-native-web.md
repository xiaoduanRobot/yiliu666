# React Native Web 技能库

## 技能概述

React Native Web 是使用React Native构建跨平台Web应用的技术，一套代码同时支持iOS、Android和Web三大平台。

## 目录结构

```
MyApp/
├── App.tsx              # 入口组件
├── index.js             # Web入口
├── index-native.js       # Native入口
├── components/          # 通用组件
├── screens/             # 页面组件
└── web/                 # Web特定配置
    └── index.html
```

## 核心概念

### 1. 跨平台组件
React Native Web将React Native组件转换为Web标准组件：
- `<View>` → `<div>`
- `<Text>` → `<span>`
- `<Image>` → `<img>`
- `<ScrollView>` → `<div>` with overflow

### 2. 样式系统
使用StyleSheet API，与React Native一致：
```jsx
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  }
});
```

### 3. 平台特定样式
```jsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      ios: { backgroundColor: 'blue' },
      android: { backgroundColor: 'green' },
      web: { backgroundColor: 'red' }
    })
  }
});
```

## 导航系统

### React Navigation配置
```bash
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler
```

### 基础导航
```jsx
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### Web深度链接
```jsx
// Web配置
const linking = {
  prefixes: ['https://myapp.com', 'myapp://'],
  config: {
    screens: {
      Home: '',
      Profile: 'user/:id',
    },
  },
};
```

## 性能优化

### 1. 代码分割
```jsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

// 按需加载页面
const ProfileScreen = React.lazy(() => import('./screens/Profile'));

// 使用
<Suspense fallback={<Loading />}>
  <ProfileScreen />
</Suspense>
```

### 2. 包优化
- 使用 `react-native-web` 而不是完整的React DOM
- 避免使用```jsx
import { memo } from 'react';

const ListItem = memo(({ item }) => {
  return <View style={styles.item}>{item.name}</View>;
});
```

### 4. Web特定优化
```jsx
// 使用CSS的content-visibility
const styles = StyleSheet.create({
  offScreen: {
    contentVisibility: 'auto',
    containIntrinsicSize: '100px',
  }
});
```

## 响应式设计

### 使用useWindowDimensions
```jsx
import { useWindowDimensions } from 'react-native';

function App() {
  const { width, height } = useWindowDimensions();
  
  return (
    <View style={width > 768 ? styles.desktop : styles.mobile}>
      <Text>Content</Text>
    </View>
  );
}
```

### 平台检测
```jsx
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Web特定逻辑
  window.addEventListener('resize', handleResize);
}
```

## 状态管理

### Context API
```jsx
const ThemeContext = React.createContext('light');

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Content />
    </ThemeContext.Provider>
  );
}
```

### Redux Toolkit
```bash
npm install @reduxjs/toolkit react-redux
```

```jsx
import { configureStore } from '@reduxjs/toolkit';
import userReducer from './features/userSlice';

const store = configureStore({
  reducer: {
    user: userReducer,
  },
});
```

## 常用命令

```bash
# Web开发
yarn web
npm run web

# 构建Web生产版本
yarn build
npm run build

# 启动Metro
yarn start
npm run start
```

## Web打包配置

### webpack.config.js
```js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};
```

## 在小端AI中的应用

小端AI可以通过React Native Web技能：
1. 生成跨平台移动应用代码
2. 构建响应式Web界面
3. 实现多端一致的用户体验
4. 优化Web应用性能

## 相关资源

- React Native Web官方文档: https://necolas.github.io/react-native-web/
- React Navigation: https://reactnavigation.org/
- Expo Web: https://docs.expo.dev/workflow/web/
