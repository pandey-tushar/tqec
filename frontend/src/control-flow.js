/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
import { useApp } from '@pixi/react';
import { Container, Point } from 'pixi.js';
import { AdjustmentFilter } from 'pixi-filters';
import notification from './components/notification';
import Grid from './graphics/Grid';
import Footprint from './plaquettes/Footprint';
import Qubit from './qubits/Qubit';
import QubitLattice from './qubits/QubitLattice';
import Button from './components/Button';
import DownloadButton from './components/download/DownloadButton';
import store from './store';

/**
 * Defines how the app behaves (button and feature placement) upon initialization
 * @returns {void}
 */
export default function InitializeControlFlow() {
  const app = useApp();
  app.stage.removeChildren(); // avoid rendering issues
  const gridSize = 50;
  const workspace = new Container();
  workspace.name = 'workspace';
  const grid = new Grid(gridSize, workspace, app);
  // Add qubits from redux store
  // const storedUnitCell = store.getState().unitCell;
  workspace.addChild(grid);
  grid.units.forEach((row) => {
    row.forEach((unit) => {
      workspace.addChild(unit);
    });
  });
  workspace.selectedPlaquette = null; // Used to update filters
  workspace.gridSize = gridSize;
  workspace.qubitRadius = 5;

  workspace.updateSelectedPlaquette = (newPlaquette) => {
    if (newPlaquette === null) {
      return;
    }
    const currentPlaquette = workspace.selectedPlaquette;
    if (currentPlaquette === newPlaquette) {
      currentPlaquette.filters = null;
      workspace.removeChild(workspace.getChildByName('control_panel'));
      workspace.selectedPlaquette = null;
    } else {
      if (currentPlaquette != null) {
        currentPlaquette.filters = null;
      }
      newPlaquette.filters = [new AdjustmentFilter({ contrast: 0.5 })];
      workspace.removeChild('control_panel');
      workspace.addChild(newPlaquette.controlPanel);
      workspace.selectedPlaquette = newPlaquette;
    }
  };

  workspace.removePlaquette = (plaquette) => {
    if (plaquette === null) {
      return;
    }
    if (workspace.selectedPlaquette === plaquette) {
      workspace.selectedPlaquette = null;
    }
    // Remove control panel if it is visible
    const currentControlPanel = workspace.getChildByName('control_panel');
    if (currentControlPanel === plaquette.controlPanel) {
      workspace.removeChild(currentControlPanel);
    }
    workspace.children
      .filter((child) => child instanceof Footprint)
      .forEach((template) => {
        if (template.getPlaquettes().includes(plaquette)) {
          template.removeChild(plaquette);
        }
      });
    plaquette.destroy({ children: true });
  };

  workspace.mainButtonPosition = new Point(125, 50);
  const { x, y } = workspace.mainButtonPosition;

  const createQubitConstellationButton = new Button(
    'Create Qubit Constellation',
    x,
    y
  );
  workspace.addChild(createQubitConstellationButton);
  const saveQubitConstellationButton = new Button(
    'Save Qubit Constellation',
    x,
    y
  );
  const lattice = new QubitLattice(workspace, app);
  const cancelQubitConstellationButton = new Button(
    'Cancel Qubit Constellation',
    x,
    y
  );
  createQubitConstellationButton.on('click', () => {
    workspace.removeChild(createQubitConstellationButton);
    workspace.addChild(saveQubitConstellationButton);
    workspace.addChild(cancelQubitConstellationButton);
    app.view.addEventListener('click', lattice.selectQubitForConstellation);
  });

  // TODO: Check the redux store for qubits and add them to the workspace
  // If there are none, instead offer to create a constellation.
  workspace.addChild(createQubitConstellationButton);

  saveQubitConstellationButton.on('click', () => {
    if (lattice.constellation.length === 0) {
      notification(app, 'Constellation must have at least one qubit');
    } else {
      workspace.removeChild(saveQubitConstellationButton);
      const finalizeBoundingQuadButton = new Button(
        'Finalize unit cell',
        x,
        y
      );
      workspace.addChild(finalizeBoundingQuadButton);
      app.view.removeEventListener('click', lattice.selectQubitForConstellation);

      // Make the grid squares selectable
      grid.units.forEach((row) => {
        row.forEach((unit) => {
          app.renderer.view.addEventListener('mousedown', unit.toggleVisibility);
        });
      });

      finalizeBoundingQuadButton.on('click', () => {
        // If the bounding box isn't a rectangle or doesn't contain every qubit, notify and return
        if (!grid.selectedUnitsRectangular()) {
          notification(app, 'Bounding quad must be rectangular');
          return;
        }
        if (!grid.contains(lattice.constellation)) {
          notification(app, 'Bounding quad must contain every qubit');
          return;
        }

        workspace.removeChild(finalizeBoundingQuadButton);
        // Grid units shall no longer be selectable
        grid.units.forEach((row) => {
          row.forEach((unit) => {
            workspace.removeChild(unit);
            app.renderer.view.removeEventListener('click', unit.toggleVisibility);
          });
        });

        // Commit unit cell to redux store
        store.dispatch({
          type: 'SET_UNIT_CELL',
          payload: {
            qubits: lattice.constellation.map((q) => q.serialized()),
            gridSquares: grid.visibleUnits().map((u) => u.serialized())
          },
        });

        // Add qubits to the workspace
        for (let horiz = 0; horiz < app.renderer.width; horiz += grid.physicalWidth) {
          for (let vertic = 0; vertic < app.renderer.height; vertic += grid.physicalHeight) {
            for (const qubit of lattice.constellation) {
              const newQubit = new Qubit(
                qubit.bbX + horiz,
                qubit.bbY + vertic,
                workspace.qubitRadius,
                workspace.gridSize
              );
              workspace.addChild(newQubit);
            }
          }
        }

        // Make the original qubits invisible to remove redundancy
        lattice.constellation.forEach((qubit) => {
          qubit.visible = false;
        });

        // Initialize Template
        const template = new Footprint(
          workspace,
          app,
          x,
          y
        );
        workspace.addChild(template.container);
        workspace.removeChild(finalizeBoundingQuadButton);

        const downloadStimButton = new DownloadButton(
          workspace,
          'Download Stim file',
          x,
          y,
          'white',
          'black'
        );
        workspace.addChild(downloadStimButton);
      });
    }
  });
  // Add the cancelQubitConstellationButton click event here
  cancelQubitConstellationButton.on('click', () => {
    // Remove the saveQubitConstellationButton and cancelQubitConstellationButton from the workspace
    workspace.removeChild(saveQubitConstellationButton);
    workspace.removeChild(cancelQubitConstellationButton);
  
    // Add back the createQubitConstellationButton to the workspace
    workspace.addChild(createQubitConstellationButton);
  
    // Remove the event listener for selecting a qubit for the constellation
    app.view.removeEventListener('click', lattice.selectQubitForConstellation);
  });

  // Final workspace setup
  workspace.visible = true;
  app.stage.addChild(workspace);
}
