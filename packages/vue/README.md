# Leafy UI - Vue Package

The Vue package provides the same components as the React package with a Vue 3 API.

## Installation

```bash
npm install @leafy-ui/vue @leafy-ui/core
# or
pnpm add @leafy-ui/vue @leafy-ui/core
```

## Usage

### As Individual Components

```vue
<template>
  <div>
    <Button variant="primary" @click="handleClick">
      Primary Button
    </Button>
    <Button variant="secondary" @click="handleClick">
      Secondary Button
    </Button>
  </div>
</template>

<script setup>
import { Button } from '@leafy-ui/vue'

const handleClick = () => {
  console.log('Button clicked!')
}
</script>

<style>
@import '@leafy-ui/core/dist/styles.css';
</style>
```

### As Vue Plugin

```js
import { createApp } from 'vue'
import LeafyUI from '@leafy-ui/vue'
import App from './App.vue'

const app = createApp(App)
app.use(LeafyUI)
app.mount('#app')
```

Then use components globally:

```vue
<template>
  <LeafyButton variant="primary">
    Global Button
  </LeafyButton>
</template>
```

## Components

### Button

Same API as the React version:

- `variant`: `'primary' | 'secondary'` (default: `'primary'`)
- `class`: Additional CSS classes
- `@click`: Click event handler

## API Compatibility

The Vue package maintains the same component API as the React package:

| React | Vue |
|-------|-----|
| `<Button variant="primary">` | `<Button variant="primary">` |
| `onClick={handler}` | `@click="handler"` |
| `className="..."` | `:class="..."` or `class="..."` |