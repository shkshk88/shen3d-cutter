#!/usr/local/lib/hermes-agent/venv/bin/python3
"""
Shen3D Cutter API — Python server for STL boolean operations.
Uses trimesh + manifold3d for lightweight cuts, FreeCAD for advanced ops.

Run: python3 cutter_api.py --port 8001
"""

import sys
# Add FreeCAD conda lib to path
sys.path.insert(0, '/opt/conda/lib')

import os
import json
import uuid
import tempfile
import argparse
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ─── trimesh backend (fast, no GUI needed) ───
import trimesh

# ─── FreeCAD backend (advanced, headless via conda) ───
FREECAD_AVAILABLE = False
try:
    import FreeCAD
    import Part
    import Mesh as FCMesh
    FREECAD_AVAILABLE = True
except ImportError:
    pass

# ─── OpenSCAD backend (profiles, headless) ───
OPENSCAD_AVAILABLE = os.path.exists('/usr/bin/openscad')

# Output directory for generated STL files
OUTPUT_DIR = os.path.join(tempfile.gettempdir(), 'shen3d-output')
os.makedirs(OUTPUT_DIR, exist_ok=True)


def split_stl_trimesh(stl_path: str, plane_normal: list, plane_point: list) -> dict:
    """Split an STL file with a plane using trimesh."""
    mesh = trimesh.load(stl_path)
    
    normal = np.array(plane_normal, dtype=float)
    origin = np.array(plane_point, dtype=float)
    
    # Slice into two halves
    upper = trimesh.intersections.slice_mesh_plane(mesh, normal, origin)
    lower = trimesh.intersections.slice_mesh_plane(mesh, -normal, origin)
    
    results = {}
    
    if upper is not None and len(upper.faces) > 0:
        upper_id = str(uuid.uuid4())[:8]
        upper_path = os.path.join(OUTPUT_DIR, f'upper_{upper_id}.stl')
        upper.export(upper_path)
        results['upper'] = {
            'path': upper_path,
            'vertices': len(upper.vertices),
            'faces': len(upper.faces),
            'volume': float(upper.volume) if upper.is_watertight else None,
        }
    
    if lower is not None and len(lower.faces) > 0:
        lower_id = str(uuid.uuid4())[:8]
        lower_path = os.path.join(OUTPUT_DIR, f'lower_{lower_id}.stl')
        lower.export(lower_path)
        results['lower'] = {
            'path': lower_path,
            'vertices': len(lower.vertices),
            'faces': len(lower.faces),
            'volume': float(lower.volume) if lower.is_watertight else None,
        }
    
    results['engine'] = 'trimesh'
    return results


def split_stl_freecad(stl_path: str, plane_normal: list, plane_point: list) -> dict:
    """Split an STL file with a plane using FreeCAD Part module."""
    if not FREECAD_AVAILABLE:
        return {'error': 'FreeCAD not available'}
    
    # Import STL
    mesh_obj = FCMesh.read(stl_path)
    
    # Convert to shape
    shape = Part.Shape()
    shape.makeShapeFromMesh(mesh_obj.Topology, 0.1)
    solid = Part.makeSolid(shape)
    
    # Create cutting box (large half-space)
    normal = FreeCAD.Vector(*plane_normal)
    point = FreeCAD.Vector(*plane_point)
    
    # Create a very large box positioned to cut
    size = 500  # mm, larger than any dental piece
    
    # Upper part: subtract everything below the plane
    cutter_lower = Part.makeBox(size * 2, size * 2, size,
                                FreeCAD.Vector(-size, -size, -size + plane_point[2]))
    upper_solid = solid.cut(cutter_lower)
    
    # Lower part: subtract everything above the plane
    cutter_upper = Part.makeBox(size * 2, size * 2, size,
                                FreeCAD.Vector(-size, -size, plane_point[2]))
    lower_solid = solid.cut(cutter_upper)
    
    results = {}
    
    # Export upper
    upper_mesh = FCMesh.Mesh(upper_solid.tessellate(0.05))
    upper_id = str(uuid.uuid4())[:8]
    upper_path = os.path.join(OUTPUT_DIR, f'upper_fc_{upper_id}.stl')
    upper_mesh.write(upper_path)
    results['upper'] = {
        'path': upper_path,
        'vertices': len(upper_mesh.Points),
        'faces': len(upper_mesh.Facets),
    }
    
    # Export lower
    lower_mesh = FCMesh.Mesh(lower_solid.tessellate(0.05))
    lower_id = str(uuid.uuid4())[:8]
    lower_path = os.path.join(OUTPUT_DIR, f'lower_fc_{lower_id}.stl')
    lower_mesh.write(lower_path)
    results['lower'] = {
        'path': lower_path,
        'vertices': len(lower_mesh.Points),
        'faces': len(lower_mesh.Facets),
    }
    
    results['engine'] = 'freecad'
    return results


def generate_profile_openscad(profile_type: str, params: dict) -> dict:
    """Generate a dental profile STL using OpenSCAD."""
    if not OPENSCAD_AVAILABLE:
        return {'error': 'OpenSCAD not available'}
    
    scad_code = ''
    profile_type = profile_type.lower()
    
    if profile_type == 'd_shape':
        width = params.get('width', 4)
        height = params.get('height', 3)
        depth = params.get('depth', 2)
        scad_code = f'''
        // D-shape dental profile
        $fn = 64;
        width = {width};
        height = {height};
        depth = {depth};
        difference() {{
            hull() {{
                translate([0, 0, 0]) cylinder(r=width/2, h=depth);
                translate([0, height*0.3, 0]) cylinder(r=width/2, h=depth);
            }}
            translate([0, -width, -1]) cube([width*2, width, depth+2]);
        }}
        '''
    elif profile_type == 'oval':
        width = params.get('width', 4)
        height = params.get('height', 5)
        depth = params.get('depth', 2)
        scad_code = f'''
        // Oval dental profile
        $fn = 64;
        resize([{width}, {height}, {depth}]) sphere(r=1);
        '''
    elif profile_type == 'rectangular':
        width = params.get('width', 4)
        height = params.get('height', 3)
        depth = params.get('depth', 2)
        fillet = params.get('fillet', 0.5)
        scad_code = f'''
        // Rectangular profile with fillet
        $fn = 32;
        minkowski() {{
            cube([{width}, {height}, {depth}]);
            sphere(r={fillet});
        }}
        '''
    else:
        return {'error': f'Unknown profile type: {profile_type}. Available: d_shape, oval, rectangular'}
    
    # Write SCAD and render
    scad_path = os.path.join(OUTPUT_DIR, f'profile_{uuid.uuid4().hex[:8]}.scad')
    stl_path = scad_path.replace('.scad', '.stl')
    
    with open(scad_path, 'w') as f:
        f.write(scad_code)
    
    os.system(f'openscad -o {stl_path} {scad_path} 2>/dev/null')
    
    if os.path.exists(stl_path) and os.path.getsize(stl_path) > 0:
        mesh = trimesh.load(stl_path)
        return {
            'stl_path': stl_path,
            'vertices': len(mesh.vertices),
            'faces': len(mesh.faces),
            'profile_type': profile_type,
            'params': params,
        }
    else:
        return {'error': 'OpenSCAD render failed'}


def stl_info(stl_path: str) -> dict:
    """Get info about an STL file."""
    mesh = trimesh.load(stl_path)
    return {
        'vertices': len(mesh.vertices),
        'faces': len(mesh.faces),
        'bounds': mesh.bounds.tolist(),
        'is_watertight': bool(mesh.is_watertight),
        'volume': float(mesh.volume) if mesh.is_watertight else None,
        'area': float(mesh.area),
    }


# ─── HTTP Server ───

class CutterAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        
        if path == '/api/health':
            self._json({
                'status': 'ok',
                'engines': {
                    'trimesh': True,
                    'freecad': FREECAD_AVAILABLE,
                    'openscad': OPENSCAD_AVAILABLE,
                }
            })
        elif path == '/api/info':
            stl_path = params.get('stl', [None])[0]
            if not stl_path or not os.path.exists(stl_path):
                self._json({'error': 'stl parameter required'}, 400)
                return
            self._json(stl_info(stl_path))
        elif path.startswith('/api/download/'):
            filename = path.replace('/api/download/', '')
            filepath = os.path.join(OUTPUT_DIR, filename)
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self._json({'error': 'File not found'}, 404)
        else:
            self._json({'error': 'Not found', 'endpoints': ['/api/health', '/api/info?stl=...', '/api/split', '/api/profile', '/api/download/...']}, 404)
    
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == '/api/split':
            body = self._read_body()
            stl_path = body.get('stl_path')
            plane_normal = body.get('plane_normal', [0, 0, 1])
            plane_point = body.get('plane_point', [0, 0, 0])
            engine = body.get('engine', 'trimesh')  # or 'freecad'
            
            if not stl_path or not os.path.exists(stl_path):
                self._json({'error': 'stl_path required and must exist'}, 400)
                return
            
            try:
                if engine == 'freecad' and FREECAD_AVAILABLE:
                    result = split_stl_freecad(stl_path, plane_normal, plane_point)
                else:
                    result = split_stl_trimesh(stl_path, plane_normal, plane_point)
                self._json(result)
            except Exception as e:
                self._json({'error': str(e)}, 500)
        
        elif path == '/api/profile':
            body = self._read_body()
            profile_type = body.get('type', 'd_shape')
            params = body.get('params', {})
            
            try:
                result = generate_profile_openscad(profile_type, params)
                self._json(result)
            except Exception as e:
                self._json({'error': str(e)}, 500)
        
        elif path == '/api/upload':
            # Save uploaded STL to temp directory
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            file_id = str(uuid.uuid4())[:8]
            stl_path = os.path.join(OUTPUT_DIR, f'upload_{file_id}.stl')
            with open(stl_path, 'wb') as f:
                f.write(body)
            self._json({'stl_path': stl_path, 'size': len(body)})
        
        else:
            self._json({'error': 'Not found'}, 404)
    
    def _read_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}
    
    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        print(f"[CutterAPI] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description='Shen3D Cutter API Server')
    parser.add_argument('--port', type=int, default=8001, help='Port to listen on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind')
    args = parser.parse_args()
    
    print(f"Shen3D Cutter API starting on {args.host}:{args.port}")
    print(f"  trimesh: ✅ | freecad: {'✅' if FREECAD_AVAILABLE else '❌'} | openscad: {'✅' if OPENSCAD_AVAILABLE else '❌'}")
    print(f"  Output dir: {OUTPUT_DIR}")
    
    server = HTTPServer((args.host, args.port), CutterAPIHandler)
    server.serve_forever()


if __name__ == '__main__':
    main()
