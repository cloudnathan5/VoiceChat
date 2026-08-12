import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { filterOptions } from '../lib/filter'

// A searchable replacement for `<select>`.
//
// This exists because a native select's popup is drawn by the OS, outside the
// page: its white 1px frame, its opaque scrollbar gutter and its square corners
// are not reachable from CSS, so they clashed with the dark UI no matter what
// was applied to the element. Rendering the list ourselves is the only way to
// style it — and it's what makes the list searchable, which a native select
// cannot be at all. Providers answer with hundreds of models; scrolling that
// list is not a real interaction.

// Both keep in sync with the panel's classes below.
const PANEL_MAX_HEIGHT = 340
const PANEL_WIDTH = 288 // w-72

function SearchableSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  emptyMessage = 'No matches',
  disabled = false,
  darkMode = true,
  className = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dropUp, setDropUp] = useState(true)
  const [alignRight, setAlignRight] = useState(false)

  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const visible = useMemo(() => filterOptions(options, query), [options, query])
  const selected = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value],
  )

  const closeMenu = useCallback((refocus = true) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    // The panel is wider than its trigger, so pin it to whichever edge keeps it
    // on screen. Left-anchoring it unconditionally pushed a horizontal
    // scrollbar onto the whole page in a narrow window.
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow)
      setAlignRight(rect.left + PANEL_WIDTH > window.innerWidth - 8 && rect.right >= PANEL_WIDTH)
    }
    setQuery('')
    const selectedIndex = options.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }, [disabled, options, value])

  const commit = useCallback(
    (option) => {
      if (!option) return
      if (option.value !== value) onChange?.(option.value)
      closeMenu()
    },
    [closeMenu, onChange, value],
  )

  // Close on an outside click.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, closeMenu])

  // Typing goes to the search box the moment the list opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // A filtered list invalidates the old highlight position.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keep the highlighted row on screen during keyboard navigation.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const handleKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => (visible.length ? (index + 1) % visible.length : 0))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => (visible.length ? (index - 1 + visible.length) % visible.length : 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(Math.max(0, visible.length - 1))
        break
      case 'Enter':
        event.preventDefault()
        commit(visible[activeIndex])
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu(false)
        break
      default:
        break
    }
  }

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
    }
  }

  const surface = darkMode
    ? 'bg-gray-800 border-gray-700 text-white'
    : 'bg-white border-gray-300 text-gray-900'
  const panel = darkMode
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200'
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500'
  const faint = darkMode ? 'text-gray-500' : 'text-gray-400'

  return (
    // min-w-0 so the trigger can shrink below its label in a tight row rather
    // than pushing a horizontal scrollbar onto the page — flex items default to
    // min-width:auto, which a native select was not subject to.
    <div className={`relative min-w-0 ${className}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.label || placeholder}
        className={`w-full flex items-center gap-2 border rounded-lg pl-3 pr-2 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${surface} ${
          disabled ? '' : darkMode ? 'hover:border-gray-600' : 'hover:border-gray-400'
        }`}
      >
        <span className={`flex-1 truncate ${selected ? '' : muted}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 transition-transform ${muted} ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-72 max-w-[calc(100vw-3rem)] rounded-xl border shadow-2xl overflow-hidden ${panel} ${
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${alignRight ? 'right-0' : 'left-0'}`}
        >
          {/* Search */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <Search size={14} className={`flex-shrink-0 ${faint}`} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className={`flex-1 min-w-0 bg-transparent text-sm focus:outline-none ${
                darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
              }`}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                  darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <X size={14} />
              </button>
            ) : (
              options.length > 0 && (
                <span className={`flex-shrink-0 text-xs tabular-nums ${faint}`}>{options.length}</span>
              )
            )}
          </div>

          {/* Options */}
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-y-auto scrollbar-subtle p-1.5"
          >
            {visible.length === 0 ? (
              <div className={`px-3 py-6 text-center text-sm ${muted}`}>{emptyMessage}</div>
            ) : (
              visible.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <div
                    key={option.value}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => commit(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                      isActive ? (darkMode ? 'bg-gray-700' : 'bg-gray-100') : ''
                    } ${
                      isSelected
                        ? darkMode
                          ? 'text-cyan-400'
                          : 'text-cyan-700'
                        : darkMode
                          ? 'text-gray-200'
                          : 'text-gray-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate" title={option.label}>{option.label}</div>
                      {option.hint && (
                        <div className={`truncate text-xs ${faint}`} title={option.hint}>
                          {option.hint}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="flex-shrink-0" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
