import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './controls';
import { colors, space, type } from './theme';

/** Keeps a failure in one tab (Chat, Updates) from taking down the map. */
export default class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`${this.props.name} failed`, error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.box}>
        <Text style={styles.title}>{this.props.name} stopped working</Text>
        <Text style={styles.text}>The map and other tabs still work.</Text>
        <Button label="Try again" kind="secondary" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  box: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center', backgroundColor: colors.canvas },
  title: { ...type.title },
  text: { ...type.bodyMuted },
});
