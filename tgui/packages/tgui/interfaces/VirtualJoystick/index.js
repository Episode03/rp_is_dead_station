import { Component } from 'inferno';
import { useBackend } from 'tgui/backend';
import { Box } from 'tgui/components';
import { Window } from 'tgui/layouts';
import './VirtualJoystick.scss';

export class VirtualJoystick extends Component {
  constructor(props) {
    super(props);
    this.state = {
      knobX: 0,
      knobY: 0,
    };
    this.trailPoints = [];
    this._animating = false;
    this.canvasElement = null;
    this.containerRef = { current: null };
    this.ctxRef = {};
    this.trailTimeoutRef = {};
    this._mouseMoveHandler = null;
    this._mouseUpHandler = null;
    this._dragActive = false;
  }

  componentDidMount() {
    if (!this.canvasElement) {
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.style.position = 'absolute';
      this.canvasElement.style.pointerEvents = 'none';
      this.canvasElement.style.width = '100%';
      this.canvasElement.style.height = '100%';
      if (this.containerRef.current) {
        this.containerRef.current.appendChild(this.canvasElement);
        this.ctxRef.current = this.canvasElement.getContext('2d');
      }
    }
  }

  componentWillUnmount() {
    if (this.trailTimeoutRef.current) {
      cancelAnimationFrame(this.trailTimeoutRef.current);
      this.trailTimeoutRef.current = null;
    }
    if (this._mouseMoveHandler) {
      window.removeEventListener('mousemove', this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    if (this._mouseUpHandler) {
      window.removeEventListener('mouseup', this._mouseUpHandler);
      this._mouseUpHandler = null;
    }
    if (this.canvasElement) {
      this.canvasElement.remove();
      this.canvasElement = null;
    }
  }

  updatePosition(clientX, clientY) {
    const container = this.containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = centerY - clientY;

    const maxDist = rect.width / 2 * 0.8;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      dx = dx / dist * maxDist;
      dy = dy / dist * maxDist;
    }

    const normX = dx / maxDist;
    const normY = dy / maxDist;

    this.setState({ knobX: normX, knobY: normY });

    const now = Date.now();
    this.trailPoints.push({ x: normX, y: normY, time: now });
    this.trailPoints = this.trailPoints.filter(p => now - p.time < 300);

    const { act } = useBackend(this.context);
    act('update_position', { x: +normX.toFixed(2), y: +normY.toFixed(2) });

    if (!this._animating) {
      this._animating = true;
      this.trailTimeoutRef.current = requestAnimationFrame(() => this.animateTrail());
    }
  }

  handleMouseDown(e) {
    e.preventDefault();
    this._dragActive = true;
    this.updatePosition(e.clientX, e.clientY);

    this._mouseMoveHandler = (e) => this.updatePosition(e.clientX, e.clientY);
    this._mouseUpHandler = () => {
      this._dragActive = false;
      this.setState({ knobX: 0, knobY: 0 });
      const { act } = useBackend(this.context);
      act('update_position', { x: 0, y: 0 });
      window.removeEventListener('mousemove', this._mouseMoveHandler);
      window.removeEventListener('mouseup', this._mouseUpHandler);
      this._mouseMoveHandler = null;
      this._mouseUpHandler = null;
    };

    window.addEventListener('mousemove', this._mouseMoveHandler);
    window.addEventListener('mouseup', this._mouseUpHandler);
  }

  animateTrail() {
    const ctx = this.ctxRef.current;
    const container = this.containerRef.current;
    if (!ctx || !container) {
      this._animating = false;
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const now = Date.now();
    this.trailPoints = this.trailPoints.filter(p => now - p.time < 300);
    const points = this.trailPoints;

    if (points.length === 0) {
      this._animating = false;
      return;
    }

    if (points.length === 1) {
      const p = points[0];
      const opacity = 1 - (now - p.time) / 300;
      const x = (p.x * 40 + 50) / 100 * width;
      const y = (50 - p.y * 40) / 100 * height;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(0, 229, 255, ${opacity})`;
      ctx.fill();
    } else {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        const age1 = now - p1.time;
        const age2 = now - p2.time;
        const opacity1 = Math.max(0, 1 - age1 / 300);
        const opacity2 = Math.max(0, 1 - age2 / 300);
        const x1 = (p1.x * 40 + 50) / 100 * width;
        const y1 = (50 - p1.y * 40) / 100 * height;
        const x2 = (p2.x * 40 + 50) / 100 * width;
        const y2 = (50 - p2.y * 40) / 100 * height;
        const lineWidth = Math.max(0.5, 3 * Math.min(opacity1, opacity2));
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `rgba(0, 229, 255, ${opacity1})`);
        gradient.addColorStop(1, `rgba(0, 229, 255, ${opacity2})`);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    }

    if (points.length > 0 || this._dragActive) {
      this.trailTimeoutRef.current = requestAnimationFrame(() => this.animateTrail());
    } else {
      this._animating = false;
    }
  }

  render() {
    const { knobX, knobY } = this.state;
    const maxPercentRadius = 40;
    const knobLeft = 50 + knobX * maxPercentRadius - 10;
    const knobTop = 50 - knobY * maxPercentRadius - 10;

    return (
      <Window title="" canClose={false}>
        <Window.Content>
          <Box className="VirtualJoystick">
            <div
              className="joystick-container"
              ref={el => { this.containerRef.current = el; }}
              onMouseDown={(e) => this.handleMouseDown(e)}
            >
              <div
                className="knob"
                style={{
                  left: `${knobLeft}%`,
                  top: `${knobTop}%`,
                }}
              />
            </div>
          </Box>
        </Window.Content>
      </Window>
    );
  }
}
