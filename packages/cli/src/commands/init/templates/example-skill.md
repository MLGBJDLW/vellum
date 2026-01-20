---
name: react-patterns
description: Best practices and patterns for React development
version: "1.0.0"
triggers:
  - react
  - component
  - hook
  - jsx
  - tsx
tags:
  - react
  - frontend
  - typescript
priority: 100
---

# React Patterns Skill

Expert knowledge for building React applications with TypeScript.

## Core Principles

1. **Composition over inheritance**: Build small, reusable components
2. **Unidirectional data flow**: Props down, events up
3. **Explicit over implicit**: Prefer explicit prop passing
4. **Type safety**: Leverage TypeScript for all components

## Component Patterns

### Functional Components (Preferred)

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({ 
  label, 
  onClick, 
  variant = 'primary',
  disabled = false 
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
```markdown

### Compound Components

```tsx
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function Tabs({ children, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

Tabs.Tab = function Tab({ id, children }: TabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab must be used within Tabs');
  
  return (
    <button
      className={ctx.activeTab === id ? 'active' : ''}
      onClick={() => ctx.setActiveTab(id)}
    >
      {children}
    </button>
  );
};
```markdown

## Hook Patterns

### Custom Hooks

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```markdown

### Cleanup Pattern

```tsx
useEffect(() => {
  const controller = new AbortController();
  
  fetchData(controller.signal)
    .then(setData)
    .catch(err => {
      if (!controller.signal.aborted) {
        setError(err);
      }
    });
  
  return () => controller.abort();
}, []);
```markdown

## Anti-Patterns to Avoid

1. **Don't mutate state directly**
   ```tsx
   // ❌ Bad
   state.items.push(newItem);
   
   // ✅ Good
   setItems([...items, newItem]);
   ```text

2. **Don't use index as key for dynamic lists**
   ```tsx
   // ❌ Bad
   items.map((item, i) => <Item key={i} {...item} />);
   
   // ✅ Good
   items.map(item => <Item key={item.id} {...item} />);
   ```text

3. **Don't overuse useEffect**
   ```tsx
   // ❌ Bad - derived state
   const [fullName, setFullName] = useState('');
   useEffect(() => {
     setFullName(`${firstName} ${lastName}`);
   }, [firstName, lastName]);
   
   // ✅ Good - compute directly
   const fullName = `${firstName} ${lastName}`;
   ```

## Testing Recommendations

- Use `@testing-library/react` for component tests
- Test behavior, not implementation
- Use `userEvent` over `fireEvent`
- Mock API calls at the network level with MSW
