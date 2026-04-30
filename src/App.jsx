import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload,
  Download,
  Trash2,
  Edit3,
  ZoomIn,
  ZoomOut,
  Minimize,
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  Pipette,
  Type,
  Lock,
  Unlock,
  Sigma,
  Bold,
  Italic,
  Underline,
  Info,
} from 'lucide-react'

/**
 * ------------------------------------------------------------------
 * 常量定义
 * ------------------------------------------------------------------
 */

const COMMON_SYMBOLS = [
  'α', 'β', 'γ', 'δ', 'ε', 'η', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω',
  'Δ', 'Σ', 'Ω', '≈', '≠', '≤', '≥', '±', '×', '÷', '∞', '√', '°', '‰',
  '→', '←', '↑', '↓', '€', '£', '¥',
]

const FONT_FAMILIES = [
  { name: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { name: '黑体', value: 'SimHei, sans-serif' },
  { name: '宋体', value: 'SimSun, serif' },
  { name: '楷体', value: 'KaiTi, serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", serif' },
]

/**
 * ------------------------------------------------------------------
 * 主组件
 * ------------------------------------------------------------------
 */
export default function App() {
  // --- 状态管理 ---
  const [step, setStep] = useState(1)
  const [imageSrc, setImageSrc] = useState(null)

  // 数据状态
  const [regions, setRegions] = useState([])
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 })

  // 历史记录 (Undo/Redo)
  const [history, setHistory] = useState([[]])
  const [historyIndex, setHistoryIndex] = useState(0)

  // 视图变换状态 (Pan & Zoom)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })

  // --- 交互状态 ---
  const [toolMode, setToolMode] = useState('draw')
  const [interactionState, setInteractionState] = useState('idle')

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [activeRegionId, setActiveRegionId] = useState(null)
  const [resizeHandle, setResizeHandle] = useState(null)
  const [initialRect, setInitialRect] = useState(null)
  const [initialTransform, setInitialTransform] = useState(null)

  // 取色器状态
  const [pickerInfo, setPickerInfo] = useState({ x: 0, y: 0, color: '#ffffff', visible: false })

  // Refs
  const viewportRef = useRef(null)
  const canvasRef = useRef(null)
  const offscreenCanvasRef = useRef(null)
  const outputCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const textAreaRef = useRef(null)

  // --- 历史记录管理 ---
  const pushHistory = (newRegions) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(JSON.parse(JSON.stringify(newRegions)))
    if (newHistory.length > 50) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setRegions(newRegions)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setRegions(JSON.parse(JSON.stringify(history[newIndex])))
      setSelectedRegionId(null)
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setRegions(JSON.parse(JSON.stringify(history[newIndex])))
      setSelectedRegionId(null)
    }
  }

  // --- 键盘快捷键 ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRegionId && interactionState === 'idle') {
        if (document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
          deleteRegion(selectedRegionId)
        }
      }
      if (e.key === 'Escape') {
        if (toolMode === 'picker') setToolMode('draw')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyIndex, history, interactionState, selectedRegionId, toolMode])

  // --- 图片上传 ---
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          setImageSrc(img.src)
          setImgSize({ width: img.width, height: img.height })
          setRegions([])
          setHistory([[]])
          setHistoryIndex(0)
          setStep(2)

          // 准备离屏 Canvas 用于取色
          if (offscreenCanvasRef.current) {
            const offCtx = offscreenCanvasRef.current.getContext('2d')
            offscreenCanvasRef.current.width = img.width
            offscreenCanvasRef.current.height = img.height
            offCtx.drawImage(img, 0, 0)
          }

          setTimeout(() => handleFitScreen(img.width, img.height), 100)
        }
        img.src = event.target.result
      }
      reader.readAsDataURL(file)
    }
  }

  // --- 视图控制 ---
  const handleFitScreen = (w = imgSize.width, h = imgSize.height) => {
    if (viewportRef.current && w > 0) {
      const vw = viewportRef.current.clientWidth
      const vh = viewportRef.current.clientHeight
      const padding = 60
      const scale = Math.min((vw - padding) / w, (vh - padding) / h)
      const x = (vw - w * scale) / 2
      const y = (vh - h * scale) / 2
      setTransform({ x, y, scale })
    }
  }

  const handleZoom = (delta, center = null) => {
    setTransform((prev) => {
      const newScale = Math.max(0.05, Math.min(prev.scale * (1 - delta * 0.1), 20))
      let cx, cy
      if (center) {
        cx = center.x
        cy = center.y
      } else if (viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect()
        cx = rect.width / 2
        cy = rect.height / 2
      } else {
        return prev
      }
      const imageX = (cx - prev.x) / prev.scale
      const imageY = (cy - prev.y) / prev.scale
      const newX = cx - imageX * newScale
      const newY = cy - imageY * newScale
      return { x: newX, y: newY, scale: newScale }
    })
  }

  const handleWheel = (e) => {
    if (step !== 2) return
    e.preventDefault()
    const rect = viewportRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 1 : -1
    handleZoom(delta, { x: mouseX, y: mouseY })
  }

  // --- 坐标转换 ---
  const screenToImage = (sx, sy) => {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale,
    }
  }

  // --- 取色核心逻辑 ---
  const getColorAtPixel = (ix, iy) => {
    if (!offscreenCanvasRef.current) return '#ffffff'
    const ctx = offscreenCanvasRef.current.getContext('2d')
    if (ix < 0 || iy < 0 || ix >= imgSize.width || iy >= imgSize.height) return null
    const data = ctx.getImageData(Math.floor(ix), Math.floor(iy), 1, 1).data
    const r = data[0].toString(16).padStart(2, '0')
    const g = data[1].toString(16).padStart(2, '0')
    const b = data[2].toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }

  const activateEyeDropper = async () => {
    // 尝试使用原生 API
    if (window.EyeDropper) {
      const eyeDropper = new window.EyeDropper()
      try {
        const result = await eyeDropper.open()
        if (selectedRegionId) {
          updateRegionProperty(selectedRegionId, 'bgColor', result.sRGBHex, true)
        }
      } catch (e) {
        console.log('EyeDropper cancelled or failed')
      }
    } else {
      // 降级为 Canvas 手动采集模式
      setToolMode('picker')
    }
  }

  // --- 鼠标交互 ---
  const getResizeHandle = (imgPos, region) => {
    if (!region) return null
    const handleSize = 12 / transform.scale
    const { x, y, width, height } = region
    const handles = {
      nw: { x: x, y: y },
      ne: { x: x + width, y: y },
      sw: { x: x, y: y + height },
      se: { x: x + width, y: y + height },
    }
    for (const [key, hPos] of Object.entries(handles)) {
      if (Math.abs(imgPos.x - hPos.x) < handleSize && Math.abs(imgPos.y - hPos.y) < handleSize) {
        return key
      }
    }
    return null
  }

  const handleMouseDown = (e) => {
    if (step !== 2) return
    const rect = viewportRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const imgPos = screenToImage(mouseX, mouseY)

    // 中键或空格平移
    if (e.button === 1 || e.getModifierState('Space')) {
      setInteractionState('panning')
      setDragStart({ x: mouseX, y: mouseY })
      setInitialTransform({ ...transform })
      return
    }

    // 取色模式
    if (toolMode === 'picker') {
      const color = getColorAtPixel(imgPos.x, imgPos.y)
      if (color && selectedRegionId) {
        updateRegionProperty(selectedRegionId, 'bgColor', color, true)
        setToolMode('draw')
      }
      return
    }

    // 拖动工具模式
    if (toolMode === 'pan') {
      setInteractionState('panning')
      setDragStart({ x: mouseX, y: mouseY })
      setInitialTransform({ ...transform })
      return
    }

    // 调整选区大小
    if (selectedRegionId) {
      const selectedRegion = regions.find((r) => r.id === selectedRegionId)
      const handle = getResizeHandle(imgPos, selectedRegion)
      if (handle) {
        setInteractionState('resizing_region')
        setResizeHandle(handle)
        setActiveRegionId(selectedRegionId)
        setDragStart(imgPos)
        setInitialRect({ ...selectedRegion })
        return
      }
    }

    // 选中或移动选区
    const clickedRegion = [...regions].reverse().find(
      (r) =>
        imgPos.x >= r.x &&
        imgPos.x <= r.x + r.width &&
        imgPos.y >= r.y &&
        imgPos.y <= r.y + r.height,
    )

    if (clickedRegion) {
      setSelectedRegionId(clickedRegion.id)
      setInteractionState('moving_region')
      setActiveRegionId(clickedRegion.id)
      setDragStart(imgPos)
      setInitialRect({ ...clickedRegion })
    } else {
      setSelectedRegionId(null)
      setInteractionState('drawing')
      setDragStart(imgPos)
    }
  }

  const handleMouseMove = (e) => {
    if (step !== 2) return
    const rect = viewportRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const imgPos = screenToImage(mouseX, mouseY)

    // 更新取色预览
    if (toolMode === 'picker') {
      const color = getColorAtPixel(imgPos.x, imgPos.y)
      setPickerInfo({ x: mouseX, y: mouseY, color: color || '#ffffff', visible: true })
    } else {
      setPickerInfo((prev) => ({ ...prev, visible: false }))
    }

    if (interactionState === 'panning') {
      const dx = mouseX - dragStart.x
      const dy = mouseY - dragStart.y
      setTransform({
        ...initialTransform,
        x: initialTransform.x + dx,
        y: initialTransform.y + dy,
      })
    } else if (interactionState === 'moving_region') {
      const dx = imgPos.x - dragStart.x
      const dy = imgPos.y - dragStart.y
      const newRegions = regions.map((r) =>
        r.id === activeRegionId
          ? {
              ...r,
              x: initialRect.x + dx,
              y: initialRect.y + dy,
            }
          : r,
      )
      setRegions(newRegions)
    } else if (interactionState === 'resizing_region') {
      const dx = imgPos.x - dragStart.x
      const dy = imgPos.y - dragStart.y
      let newRect = { ...initialRect }
      if (resizeHandle.includes('e')) newRect.width = Math.max(10, initialRect.width + dx)
      if (resizeHandle.includes('s')) newRect.height = Math.max(10, initialRect.height + dy)
      if (resizeHandle.includes('w')) {
        const finalWidth = Math.max(10, initialRect.width - dx)
        newRect.x = initialRect.x + (initialRect.width - finalWidth)
        newRect.width = finalWidth
      }
      if (resizeHandle.includes('n')) {
        const finalHeight = Math.max(10, initialRect.height - dy)
        newRect.y = initialRect.y + (initialRect.height - finalHeight)
        newRect.height = finalHeight
      }
      setRegions(regions.map((r) => (r.id === activeRegionId ? { ...r, ...newRect } : r)))
    }

    // 更新鼠标样式
    if (interactionState === 'idle') {
      if (toolMode === 'picker') {
        viewportRef.current.style.cursor = 'none'
      } else if (e.getModifierState('Space') || toolMode === 'pan') {
        viewportRef.current.style.cursor = 'grab'
      } else if (
        selectedRegionId &&
        getResizeHandle(imgPos, regions.find((r) => r.id === selectedRegionId))
      ) {
        viewportRef.current.style.cursor = 'nwse-resize'
      } else if (
        [...regions]
          .reverse()
          .find(
            (r) =>
              imgPos.x >= r.x &&
              imgPos.x <= r.x + r.width &&
              imgPos.y >= r.y &&
              imgPos.y <= r.y + r.height,
          )
      ) {
        viewportRef.current.style.cursor = 'move'
      } else {
        viewportRef.current.style.cursor = 'crosshair'
      }
    } else if (interactionState === 'panning') {
      viewportRef.current.style.cursor = 'grabbing'
    }
  }

  const handleMouseUp = (e) => {
    if (interactionState === 'moving_region' || interactionState === 'resizing_region') {
      pushHistory(regions)
    } else if (interactionState === 'drawing') {
      const rect = viewportRef.current.getBoundingClientRect()
      const imgPos = screenToImage(e.clientX - rect.left, e.clientY - rect.top)

      const width = Math.abs(imgPos.x - dragStart.x)
      const height = Math.abs(imgPos.y - dragStart.y)

      if (width > 5 && height > 5) {
        const newRegion = {
          id: `reg-${Date.now()}`,
          x: Math.min(imgPos.x, dragStart.x),
          y: Math.min(imgPos.y, dragStart.y),
          width,
          height,
          translatedText: '',
          bgColor: '#ffffff',
          textColor: '#000000',
          fontSize: 24,
          fontFamily: '"Microsoft YaHei", sans-serif',
          isBold: false,
          isItalic: false,
          isUnderline: false,
          autoScale: true,
        }
        const newRegions = [...regions, newRegion]
        pushHistory(newRegions)
        setSelectedRegionId(newRegion.id)
      }
    }

    setInteractionState('idle')
    setActiveRegionId(null)
    setInitialRect(null)
    setInitialTransform(null)
    setResizeHandle(null)
  }

  // --- 渲染 Canvas ---
  const renderCanvas = useCallback(() => {
    if (!canvasRef.current || !imageSrc) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const img = new Image()
    img.src = imageSrc

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      regions.forEach((r) => {
        const isSelected = r.id === selectedRegionId

        // 背景
        ctx.fillStyle = r.bgColor
        ctx.fillRect(r.x, r.y, r.width, r.height)

        // 文字渲染
        if (r.translatedText) {
          ctx.fillStyle = r.textColor
          ctx.textBaseline = 'top'
          ctx.textAlign = 'center'

          const lines = r.translatedText.split('\n')
          let fontSize = 24

          if (r.autoScale !== false) {
            fontSize = Math.min(Math.max(10, (r.height / (lines.length * 1.2)) * 0.9), 500)
          } else {
            fontSize = r.fontSize || 24
          }

          const fontWeight = r.isBold ? 'bold' : 'normal'
          const fontStyle = r.isItalic ? 'italic' : 'normal'
          const fontFamily = r.fontFamily || '"Microsoft YaHei", sans-serif'

          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`

          const lineHeight = fontSize * 1.2
          const totalTextHeight = lines.length * lineHeight
          const startY = r.y + (r.height - totalTextHeight) / 2

          lines.forEach((line, i) => {
            const y = startY + i * lineHeight
            const x = r.x + r.width / 2
            ctx.fillText(line, x, y)

            if (r.isUnderline) {
              const metrics = ctx.measureText(line)
              const lineX = x - metrics.width / 2
              const lineY = y + fontSize * 0.95
              ctx.fillRect(lineX, lineY, metrics.width, Math.max(1, fontSize * 0.05))
            }
          })
        }

        // 边框 & 手柄
        if (isSelected) {
          const lineWidth = 2 / transform.scale
          ctx.strokeStyle = '#4f46e5'
          ctx.lineWidth = Math.max(1, lineWidth)
          ctx.strokeRect(r.x, r.y, r.width, r.height)

          const handleSize = 10 / transform.scale
          const half = handleSize / 2
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = '#4f46e5'
          ctx.lineWidth = 1

          const corners = [
            { x: r.x, y: r.y },
            { x: r.x + r.width, y: r.y },
            { x: r.x, y: r.y + r.height },
            { x: r.x + r.width, y: r.y + r.height },
          ]
          corners.forEach((c) => {
            ctx.beginPath()
            ctx.rect(c.x - half, c.y - half, handleSize, handleSize)
            ctx.fill()
            ctx.stroke()
          })
        }
      })
    }

    if (img.complete) draw()
    else img.onload = draw
  }, [imageSrc, regions, selectedRegionId, transform.scale])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  // --- 数据更新 ---
  const updateRegionProperty = (id, prop, value, shouldPushHistory = false) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, [prop]: value } : r))
      if (shouldPushHistory) pushHistory(next)
      return next
    })
  }

  const insertSymbol = (symbol) => {
    if (!selectedRegionId) return
    const region = regions.find((r) => r.id === selectedRegionId)
    if (region) {
      const newText = region.translatedText + symbol
      updateRegionProperty(selectedRegionId, 'translatedText', newText, true)
      setTimeout(() => {
        if (textAreaRef.current) textAreaRef.current.focus()
      }, 0)
    }
  }

  const deleteRegion = (id) => {
    const newRegions = regions.filter((r) => r.id !== id)
    pushHistory(newRegions)
    setSelectedRegionId(null)
  }

  const generateResult = () => {
    if (!outputCanvasRef.current || !imageSrc) return
    const canvas = outputCanvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.src = imageSrc
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      regions.forEach((r) => {
        ctx.fillStyle = r.bgColor
        ctx.fillRect(r.x, r.y, r.width, r.height)
        if (r.translatedText) {
          ctx.fillStyle = r.textColor
          ctx.textBaseline = 'top'
          ctx.textAlign = 'center'
          const lines = r.translatedText.split('\n')
          let fSize =
            r.autoScale !== false
              ? Math.min(Math.max(10, (r.height / (lines.length * 1.2)) * 0.9), 500)
              : r.fontSize
          ctx.font = `${r.isItalic ? 'italic' : 'normal'} ${r.isBold ? 'bold' : 'normal'} ${fSize}px ${r.fontFamily}`
          const lHeight = fSize * 1.2
          const startY = r.y + (r.height - lines.length * lHeight) / 2
          lines.forEach((line, i) => {
            const y = startY + i * lHeight
            const x = r.x + r.width / 2
            ctx.fillText(line, x, y)
            if (r.isUnderline) {
              const m = ctx.measureText(line)
              ctx.fillRect(x - m.width / 2, y + fSize * 0.95, m.width, Math.max(1, fSize * 0.05))
            }
          })
        }
      })
      const link = document.createElement('a')
      link.download = `translated_image_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
  }

  // --- 拖拽上传支持 ---
  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer?.files?.[0]
      if (file && file.type.startsWith('image/')) {
        const fakeEvent = { target: { files: [file] } }
        handleFileChange(fakeEvent)
      }
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-800 overflow-hidden font-sans">
      {/* 顶部导航 */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex justify-between items-center z-30 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              ImageTrans <span className="text-indigo-500">Pro</span>
            </span>
          </div>

          {step === 2 && (
            <div className="flex items-center gap-1 border-l border-slate-200 pl-4 ml-2">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="p-2 hover:bg-slate-100 rounded-md disabled:opacity-30 transition-colors"
                title="撤销 (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-2 hover:bg-slate-100 rounded-md disabled:opacity-30 transition-colors"
                title="重做 (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-slate-200 mx-2"></div>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                <button
                  onClick={() => setToolMode('draw')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${toolMode === 'draw' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <MousePointer2 className="w-3.5 h-3.5" /> 选区
                </button>
                <button
                  onClick={() => setToolMode('pan')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${toolMode === 'pan' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Hand className="w-3.5 h-3.5" /> 视图
                </button>
              </div>
            </div>
          )}
        </div>

        {step === 2 && (
          <button
            onClick={generateResult}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" /> 导出结果
          </button>
        )}
      </header>

      {/* 主体区域 */}
      <main className="flex-1 flex overflow-hidden">
        {step === 1 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 bg-slate-50">
            <div className="max-w-md w-full bg-white p-12 rounded-[2.5rem] shadow-2xl shadow-slate-200 text-center border border-slate-100">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce">
                <Upload className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-3">开始编辑</h2>
              <p className="text-slate-400 mb-10 leading-relaxed font-medium">
                支持 PNG, JPG。所有操作均在本地完成，保护您的隐私。
              </p>
              <button
                onClick={() => fileInputRef.current.click()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 transition-all hover:scale-[1.02] active:scale-95"
              >
                选择图片
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
              />
              <p className="text-xs text-slate-300 mt-4">
                或直接拖拽图片到窗口
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 画布视口 */}
            <div
              ref={viewportRef}
              className="flex-1 relative bg-slate-200 overflow-hidden select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
            >
              {/* 核心画布堆栈 */}
              <div
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: '0 0',
                  width: imgSize.width,
                  height: imgSize.height,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={imgSize.width}
                  height={imgSize.height}
                  className="block shadow-2xl"
                />
              </div>

              {/* 取色器实时预览提示 */}
              {toolMode === 'picker' && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white px-6 py-2 rounded-full text-xs font-bold flex items-center gap-3 z-50 border border-white/20">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  点击图片取色，按 ESC 退出
                </div>
              )}

              {/* 自定义取色器光标预览 */}
              {toolMode === 'picker' && pickerInfo.visible && (
                <div
                  className="pointer-events-none fixed z-50 flex flex-col items-center"
                  style={{ left: pickerInfo.x, top: pickerInfo.y }}
                >
                  <div
                    className="w-16 h-16 rounded-full border-4 border-white shadow-xl overflow-hidden flex items-center justify-center relative"
                    style={{
                      backgroundColor: pickerInfo.color,
                      transform: 'translate(-50%, -120%)',
                    }}
                  >
                    <div className="w-full h-full border border-black/10 rounded-full flex items-center justify-center">
                      <div className="w-1 h-1 bg-white mix-blend-difference rounded-full"></div>
                    </div>
                  </div>
                  <div className="bg-white/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-mono font-bold shadow-md -translate-y-full mt-1 border border-slate-200">
                    {pickerInfo.color.toUpperCase()}
                  </div>
                </div>
              )}

              {/* 底部控制条 */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-xl border border-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-20">
                <div className="flex items-center gap-1">
                  <button onClick={() => handleZoom(1)} className="p-2 hover:bg-slate-100 rounded-lg">
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono font-bold w-12 text-center">
                    {Math.round(transform.scale * 100)}%
                  </span>
                  <button onClick={() => handleZoom(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-px h-6 bg-slate-300/50"></div>
                <button
                  onClick={() => handleFitScreen()}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                  title="适应屏幕"
                >
                  <Minimize className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 右侧属性面板 */}
            <aside className="w-80 bg-white border-l border-slate-200 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-500" />
                  编辑属性
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {selectedRegionId ? (
                  <>
                    {/* 文本内容 */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        内容
                      </label>
                      <textarea
                        ref={textAreaRef}
                        rows={4}
                        value={regions.find((r) => r.id === selectedRegionId)?.translatedText || ''}
                        onChange={(e) =>
                          updateRegionProperty(selectedRegionId, 'translatedText', e.target.value)
                        }
                        onBlur={() => pushHistory(regions)}
                        placeholder="输入文本内容..."
                        className="w-full text-sm border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 p-4 resize-none transition-all outline-none leading-relaxed"
                      />
                    </div>

                    {/* 字体样式 */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Type className="w-3 h-3" /> 字体与缩放
                        </label>
                        <button
                          onClick={() =>
                            updateRegionProperty(
                              selectedRegionId,
                              'autoScale',
                              !regions.find((r) => r.id === selectedRegionId).autoScale,
                              true,
                            )
                          }
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            regions.find((r) => r.id === selectedRegionId)?.autoScale !== false
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                              : 'bg-slate-100 border-slate-200 text-slate-500'
                          }`}
                        >
                          {regions.find((r) => r.id === selectedRegionId)?.autoScale !== false ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : (
                            <Unlock className="w-2.5 h-2.5" />
                          )}
                          {regions.find((r) => r.id === selectedRegionId)?.autoScale !== false
                            ? '自动字号'
                            : '手动控制'}
                        </button>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl space-y-4 border border-slate-100">
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={
                              regions.find((r) => r.id === selectedRegionId)?.fontFamily || ''
                            }
                            onChange={(e) =>
                              updateRegionProperty(
                                selectedRegionId,
                                'fontFamily',
                                e.target.value,
                                true,
                              )
                            }
                            className="col-span-2 text-xs border border-slate-200 rounded-lg h-10 px-2 bg-white"
                          >
                            {FONT_FAMILIES.map((f) => (
                              <option key={f.name} value={f.value}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            disabled={
                              regions.find((r) => r.id === selectedRegionId)?.autoScale !== false
                            }
                            value={
                              regions.find((r) => r.id === selectedRegionId)?.fontSize || 24
                            }
                            onChange={(e) =>
                              updateRegionProperty(
                                selectedRegionId,
                                'fontSize',
                                parseInt(e.target.value),
                              )
                            }
                            onBlur={() => pushHistory(regions)}
                            className="w-full h-10 text-xs border border-slate-200 rounded-lg text-center bg-white disabled:opacity-50"
                          />
                        </div>

                        <div className="flex justify-between items-center">
                          <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-100">
                            {[
                              { key: 'isBold', icon: Bold },
                              { key: 'isItalic', icon: Italic },
                              { key: 'isUnderline', icon: Underline },
                            ].map((style) => {
                              const active =
                                regions.find((r) => r.id === selectedRegionId)?.[style.key]
                              return (
                                <button
                                  key={style.key}
                                  onClick={() =>
                                    updateRegionProperty(
                                      selectedRegionId,
                                      style.key,
                                      !active,
                                      true,
                                    )
                                  }
                                  className={`p-2 rounded-md transition-colors ${active ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <style.icon className="w-3.5 h-3.5" />
                                </button>
                              )
                            })}
                          </div>

                          <div className="flex gap-3">
                            {/* 颜色控制 */}
                            <div className="flex flex-col items-center gap-1">
                              <div
                                className="relative w-8 h-8 rounded-full border-2 border-white shadow-md overflow-hidden ring-1 ring-slate-200 cursor-pointer"
                                title="文字颜色"
                              >
                                <input
                                  type="color"
                                  className="absolute inset-0 w-16 h-16 -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                                  value={
                                    regions.find((r) => r.id === selectedRegionId)?.textColor ||
                                    '#000000'
                                  }
                                  onChange={(e) =>
                                    updateRegionProperty(
                                      selectedRegionId,
                                      'textColor',
                                      e.target.value,
                                    )
                                  }
                                  onBlur={() => pushHistory(regions)}
                                />
                              </div>
                              <span className="text-[8px] font-bold text-slate-400">文字</span>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="relative w-8 h-8 rounded-full border-2 border-white shadow-md overflow-hidden ring-1 ring-slate-200 cursor-pointer"
                                  title="背景颜色"
                                >
                                  <input
                                    type="color"
                                    className="absolute inset-0 w-16 h-16 -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                                    value={
                                      regions.find((r) => r.id === selectedRegionId)?.bgColor ||
                                      '#ffffff'
                                    }
                                    onChange={(e) =>
                                      updateRegionProperty(
                                        selectedRegionId,
                                        'bgColor',
                                        e.target.value,
                                      )
                                    }
                                    onBlur={() => pushHistory(regions)}
                                  />
                                </div>
                                {/* 取色器按钮 */}
                                <button
                                  onClick={activateEyeDropper}
                                  className={`p-2 rounded-full border transition-all ${toolMode === 'picker' ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-500 hover:text-indigo-600'}`}
                                  title="从图片吸取背景色"
                                >
                                  <Pipette className="w-4 h-4" />
                                </button>
                              </div>
                              <span className="text-[8px] font-bold text-slate-400">
                                背景与吸色
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 符号面板 */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Sigma className="w-3 h-3" /> 符号库
                      </label>
                      <div className="grid grid-cols-6 gap-1.5 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        {COMMON_SYMBOLS.map((sym) => (
                          <button
                            key={sym}
                            onClick={() => insertSymbol(sym)}
                            className="h-8 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-xs transition-all active:scale-90 font-sans"
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteRegion(selectedRegionId)}
                      className="w-full py-3 mt-4 text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <Trash2 className="w-4 h-4" /> 删除此区域
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-300 py-20 text-center px-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                      <MousePointer2 className="w-8 h-8 opacity-20" />
                    </div>
                    <h4 className="text-slate-900 font-bold mb-1">未选中区域</h4>
                    <p className="text-xs font-medium leading-relaxed">
                      在图片上点击并拖拽
                      <br />
                      即可创建新的文本框
                    </p>
                  </div>
                )}
              </div>

              <div className="p-5 text-[9px] text-slate-400 border-t border-slate-100 text-center font-medium">
                按住{' '}
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Space</span>{' '}
                拖动视图 •{' '}
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Scroll</span>{' '}
                缩放
              </div>
            </aside>

            {/* 隐藏画板用于导出和取色 */}
            <canvas ref={offscreenCanvasRef} className="hidden" />
            <canvas
              ref={outputCanvasRef}
              width={imgSize.width}
              height={imgSize.height}
              className="hidden"
            />
          </>
        )}
      </main>
    </div>
  )
}
