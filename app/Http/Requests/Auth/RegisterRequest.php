<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Rules\Unique;

class RegisterRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', new Unique(User::class, 'email')],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ];
    }
}