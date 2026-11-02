import { ShieldCheck, X } from 'lucide-react'
import { IconButton } from './IconButton'
import { Modal } from './Modal'
export function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal titleId="help-title" onClose={onClose}>
      <section className="dialog help-dialog" aria-labelledby="help-title">
        <IconButton label="Close help" onClick={onClose}>
          <X />
        </IconButton>
        <span className="eyebrow">A FEW THINGS FOR THE ROAD</span>
        <h2 id="help-title">You’re in no hurry.</h2>
        <p>There’s no score, no traffic, and nowhere you need to be.</p>
        <div className="key-list">
          {[
            ['W / ↑', 'Accelerate'],
            ['S / ↓', 'Brake, then reverse'],
            ['A D / ← →', 'Steer'],
            ['Space', 'Handbrake'],
            ['F', 'Toggle autodrive'],
            ['G', 'Choose assistance mode'],
            ['+ / -', 'Adjust cruise speed'],
            ['C', 'Change camera'],
            ['Q / E', 'Previous / next scenery'],
            ['V / Shift V', 'Next / previous vehicle'],
            ['M', 'Toggle mouse driving'],
            ['R', 'Return to the road'],
            ['P / Esc', 'Pause the drive'],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
        <p>
          Steering takes over steering assistance. Using the pedals takes over speed assistance.
          Choose assistance and one-pedal driving in Controls settings.
        </p>
        <p>
          Controller: left stick steers, right trigger accelerates, and left trigger brakes. A
          starts, B holds the handbrake, X toggles assistance, Y changes camera, and Start pauses.
          Use the left bumper to choose assistance and the D-pad up/down to adjust cruise speed.
        </p>
        <div className="help-note">
          <p>
            Mouse driving: move horizontally to steer, hold left click to accelerate, or right click
            to brake and reverse. Adjust sensitivity in Controls settings.
          </p>
        </div>
        <div className="help-note">
          <ShieldCheck size={19} />
          <p>
            Once you see “Offline ready”, this entire world works without the internet. Your
            preferences stay on this device.
          </p>
        </div>
      </section>
    </Modal>
  )
}
