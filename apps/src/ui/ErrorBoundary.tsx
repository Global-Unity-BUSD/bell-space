import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { Button } from './controls';
import { colors, space, type } from './theme';

/** Keeps a failure in one tab (Chat, Updates) from taking down the map. */
export default class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`${this.props.name} failed`, error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Failed name={this.props.name} onRetry={() => this.setState({ failed: false })} />;
  }
}

function Failed({ name, onRetry }: { name: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('error.title', { name })}</Text>
      <Text style={styles.text}>{t('error.text')}</Text>
      <Button label={t('error.retry')} kind="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center', backgroundColor: colors.canvas },
  title: { ...type.title },
  text: { ...type.bodyMuted },
});
