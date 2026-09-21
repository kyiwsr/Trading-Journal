import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// The lazy dashboard chunk can take longer than the 1s default to load while other test files run.
configure({ asyncUtilTimeout: 5000 })

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

// jsdom has no modal dialog support; this lets components call showModal and close.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}
