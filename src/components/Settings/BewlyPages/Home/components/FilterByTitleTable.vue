<script lang="ts" setup>
import { settings } from '~/logic'

import KeywordTable from '../../../components/KeywordTable.vue'
</script>

<template>
  <KeywordTable v-model="settings.filterByTitle" />
</template>
