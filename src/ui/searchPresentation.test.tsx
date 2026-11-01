import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import SearchScreen from '../app/search';

const scenario = vi.hoisted(() => ({ natural: true, query: '정문' }));

vi.mock('react', async () => ({
  ...(await vi.importActual('react')),
  useState: (initial: unknown) => [initial, vi.fn()],
  useMemo: (create: () => unknown) => create(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: vi.fn(),
}));
vi.mock('expo-router', () => ({ router: {}, useLocalSearchParams: () => ({ q: scenario.query }) }));
vi.mock('react-native', () => ({
  Alert: {},
  Keyboard: {},
  StyleSheet: { create: (styles: unknown) => styles },
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
}));
vi.mock('lucide-react-native', () =>
  Object.fromEntries(['Building', 'Info', 'MapPin', 'MessageCircleQuestion', 'Navigation', 'Search', 'X'].map((name) => [name, name])),
);
vi.mock('../state/AppState', () => ({
  useApp: () => ({
    pkg: fixture,
    settings: { language: 'ko', naturalSearchDefault: scenario.natural },
    aiModel: true,
    recentSearches: ['북악관'],
  }),
}));
vi.mock('../nlp/gemmaRuntime', () => ({ cancelInterpret: vi.fn(), interpretWithGemma: vi.fn() }));
vi.mock('../location/fix', () => ({ currentLocationLabel: vi.fn() }));
vi.mock('../location/goRoute', () => ({ beginRoute: vi.fn() }));
vi.mock('../location/start', () => ({ startFromFix: vi.fn() }));
vi.mock('./feedback', () => ({ useToast: () => vi.fn() }));
vi.mock('./components', () =>
  Object.fromEntries(['Button', 'IconButton', 'ResultRow', 'SearchInput', 'StatusChip'].map((name) => [name, name])),
);
vi.mock('./kit', () => ({ Card: 'Card', P: 'P', Screen: 'Screen', Section: 'Section' }));
vi.mock('./v3', () => ({ Character: 'Character' }));
function elements(node: ReactNode): ReactElement<{ children?: ReactNode; title?: string; placeholder?: string }>[] {
  const out: ReactElement<{ children?: ReactNode; title?: string; placeholder?: string }>[] = [];
  Children.forEach(node, (child) => {
    if (isValidElement<{ children?: ReactNode; title?: string; placeholder?: string }>(child)) {
      out.push(child);
      out.push(...elements(child.props.children));
    }
  });
  return out;
}

describe('search screen controls', () => {
  beforeEach(() => {
    scenario.natural = true;
    scenario.query = '정문';
  });
  it('does not show interpretation keywords or example suggestions in natural mode', () => {
    const nodes = elements(SearchScreen());
    expect(nodes.find((n) => n.type === 'SearchInput')?.props.placeholder).toBe('문장으로 입력하세요');
    expect(nodes.some((n) => n.props.children === '이렇게 알아들었어요')).toBe(false);
    expect(nodes.some((n) => n.props.children === '도착: 정문')).toBe(false);
  });
  it.each([true, false])('keeps history suggestions only in basic search (natural=%s)', (natural) => {
    scenario.natural = natural;
    scenario.query = '';
    const nodes = elements(SearchScreen());
    expect(nodes.some((n) => n.type === 'ResultRow' && n.props.title === '북악관')).toBe(!natural);
  });

  it('renders the input first and only a compact label and switch immediately below', () => {
    const screen = SearchScreen();
    const children = Children.toArray(screen.props.children).filter(isValidElement);
    expect(children[0].type).toBe('SearchInput');
    const mode = children[1];
    expect(mode.type).toBe('View');
    const row = Children.toArray((mode.props as { children: ReactNode }).children).filter(isValidElement);
    expect(row.map((element) => element.type)).toEqual(['Text', 'Switch']);
    expect((row[0].props as { children: string }).children).toBe('자연어로 검색');
    expect((mode.props as { style: { minHeight: number } }).style.minHeight).toBeGreaterThanOrEqual(48);
  });
});
