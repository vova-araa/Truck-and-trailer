import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('rendert een element', () => {
    render(<div>hallo</div>);
    expect(screen.getByText('hallo')).toBeInTheDocument();
  });
});
