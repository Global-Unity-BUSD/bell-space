import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type View } from 'react-native';

// How far the keyboard overlaps `container`, measured in the window, so
// floating panels and chat inputs can sit above it without resizing the screen.
export function useKeyboardInset(container: RefObject<ComponentRef<typeof View> | null>) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const animate = (event?: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext({ duration: event?.duration || 250,
          update: { type: LayoutAnimation.Types.keyboard } });
      }
    };
    const show = (event: KeyboardEvent) => {
      container.current?.measureInWindow((_x, y, _w, h) => {
        animate(event);
        setInset(Math.max(0, y + h - event.endCoordinates.screenY));
      });
    };
    const hide = (event: KeyboardEvent) => { animate(event); setInset(0); };
    const subs = Platform.OS === 'ios'
      ? [Keyboard.addListener('keyboardWillChangeFrame', show), Keyboard.addListener('keyboardWillHide', hide)]
      : [Keyboard.addListener('keyboardDidShow', show), Keyboard.addListener('keyboardDidHide', hide)];
    return () => subs.forEach((sub) => sub.remove());
  }, [container]);
  return inset;
}
